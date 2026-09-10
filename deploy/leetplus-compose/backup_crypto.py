"""Streaming authenticated backup encryption; only the public key goes to Linux.

Private keys are DPAPI-protected for the Windows operator, never JSON/env/Git.
Decrypt publishes plaintext only after the complete AES-GCM tag is verified.
The binary envelope is data, not an executable pickle/archive deserializer.
"""
import argparse
import base64
import ctypes
import hashlib
import json
import os
import struct
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

MAGIC = b"LEETPLUS-BACKUP-1\x00"
CHUNK = 1024 * 1024


def dpapi(value, decrypt=False):
    if os.name != "nt":
        raise ValueError("Private-key custody requires Windows DPAPI")

    class Blob(ctypes.Structure):
        _fields_ = [("size", ctypes.c_ulong), ("data", ctypes.POINTER(ctypes.c_ubyte))]

    raw = (ctypes.c_ubyte * len(value)).from_buffer_copy(value)
    source, target = Blob(len(value), raw), Blob()
    function = ctypes.windll.crypt32.CryptUnprotectData if decrypt else ctypes.windll.crypt32.CryptProtectData
    if not function(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(target)):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(target.data, target.size)
    finally:
        ctypes.windll.kernel32.LocalFree(target.data)


def write_exclusive(path, value):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "wb") as stream:
        stream.write(value)
        stream.flush()
        os.fsync(stream.fileno())


def keygen(private, public):
    if Path(private).exists() or Path(public).exists():
        raise ValueError("Key files already exist; rotation is a separate operation")
    key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    secret = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    visible = key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
    write_exclusive(private, dpapi(secret))
    write_exclusive(public, visible)
    return {"publicKeySha256": hashlib.sha256(visible).hexdigest()}


def encrypt(source, destination, public):
    public_bytes = Path(public).read_bytes()
    key = serialization.load_pem_public_key(public_bytes)
    if not isinstance(key, rsa.RSAPublicKey) or key.key_size < 3072:
        raise ValueError("RSA3072 or stronger recipient required")
    data_key, nonce = os.urandom(32), os.urandom(12)
    wrapped = key.encrypt(data_key, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    header = json.dumps({"algorithm": "RSA-OAEP-SHA256+AES-256-GCM", "recipient": hashlib.sha256(public_bytes).hexdigest(), "nonce": base64.b64encode(nonce).decode(), "wrappedKey": base64.b64encode(wrapped).decode()}, sort_keys=True, separators=(",", ":")).encode()
    cipher = Cipher(algorithms.AES(data_key), modes.GCM(nonce)).encryptor()
    cipher.authenticate_additional_data(header)
    temporary = str(destination) + ".partial"
    plaintext_hash = hashlib.sha256()
    if Path(destination).exists():
        raise ValueError("Backup already exists")
    with open(source, "rb") as inp, open(temporary, "xb") as out:
        os.chmod(temporary, 0o600)
        out.write(MAGIC + struct.pack(">I", len(header)) + header)
        while block := inp.read(CHUNK):
            plaintext_hash.update(block)
            out.write(cipher.update(block))
        out.write(cipher.finalize())
        out.write(cipher.tag)
        out.flush()
        os.fsync(out.fileno())
    os.link(temporary, destination)
    Path(temporary).unlink()
    return {"plaintextSha256": plaintext_hash.hexdigest(), "recipient": hashlib.sha256(public_bytes).hexdigest(), "bytes": Path(destination).stat().st_size}


def decrypt(source, destination, private):
    key = serialization.load_pem_private_key(dpapi(Path(private).read_bytes(), decrypt=True), password=None)
    temporary = str(destination) + ".partial"
    if Path(destination).exists():
        raise ValueError("Restore destination already exists")
    created = False
    try:
        with open(source, "rb") as inp, open(temporary, "xb") as out:
            created = True
            os.chmod(temporary, 0o600)
            if inp.read(len(MAGIC)) != MAGIC:
                raise ValueError("Invalid backup magic")
            length = struct.unpack(">I", inp.read(4))[0]
            if not 100 <= length <= 4096:
                raise ValueError("Invalid backup header length")
            header = inp.read(length)
            value = json.loads(header)
            if value.get("algorithm") != "RSA-OAEP-SHA256+AES-256-GCM":
                raise ValueError("Unsupported backup algorithm")
            data_key = key.decrypt(base64.b64decode(value["wrappedKey"], validate=True), padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
            cipher = Cipher(algorithms.AES(data_key), modes.GCM(base64.b64decode(value["nonce"], validate=True))).decryptor()
            cipher.authenticate_additional_data(header)
            remaining = Path(source).stat().st_size - inp.tell() - 16
            if remaining < 0:
                raise ValueError("Truncated backup")
            while remaining:
                block = inp.read(min(CHUNK, remaining))
                if not block:
                    raise ValueError("Truncated ciphertext")
                out.write(cipher.update(block))
                remaining -= len(block)
            out.write(cipher.finalize_with_tag(inp.read(16)))
            out.flush()
            os.fsync(out.fileno())
        os.link(temporary, destination)
        Path(temporary).unlink()
    except BaseException:
        # Only the exact temporary regular file created for this output.
        if created and Path(temporary).is_file() and not Path(temporary).is_symlink():
            Path(temporary).unlink()
        raise
    return {"decision": "AUTHENTICATED_DECRYPTION_PASS", "bytes": Path(destination).stat().st_size}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["keygen", "encrypt", "decrypt"])
    parser.add_argument("--private")
    parser.add_argument("--public")
    parser.add_argument("--input")
    parser.add_argument("--output")
    args = parser.parse_args()
    if args.command == "keygen":
        result = keygen(args.private, args.public)
    elif args.command == "encrypt":
        result = encrypt(args.input, args.output, args.public)
    else:
        result = decrypt(args.input, args.output, args.private)
    print(json.dumps(result))
