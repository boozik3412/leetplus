"""Protected one-shot cache quarantine. Generator substitutes only PLAN_B64.

Never execute this template. The final captured script requires a direct GO
receipt digest in argv and is sent over pinned SSH from the dispatcher.
"""
import base64
import ctypes
import datetime as dt
import fcntl
import hashlib
import json
import os
import pathlib
import re
import selectors
import signal
import stat
import subprocess
import sys
import time

PLAN_B64 = 'eyJhY2NlcHRlZEluc3RhbGwiOnsiZGlyZWN0b3J5SWRlbnRpdHkiOnsiY3RpbWVOcyI6IjE3OTAzNTIzMTUzNjUyMzkzMTkiLCJkZXZpY2UiOjY0NTEyLCJnaWQiOjAsImlub2RlIjo1Mzc3NTczLCJtb2RlIjo0NDgsIm10aW1lTnMiOiIxNzkwMzUyMzE1MzY1MjM5MzE5IiwibmxpbmsiOjMsInBhdGgiOiIvdXNyL2xvY2FsL2xpYi9sZWV0cGx1cy1jb21wb3NlL2IwY2JmM2E0ZjMwMmIyOTk3NjJmYTA1NWYzYmZmZTAzNzZhOTExODIiLCJzaXplIjo0MDk2LCJzdGF0ZSI6IlBSRVNFTlQiLCJ0eXBlIjoiZGlyZWN0b3J5IiwidWlkIjowfSwiZmlsZUNvdW50Ijo5OSwiZnVsbEZpbGVNYXBTaGEyNTYiOiI4NTMyMzc3ZDNlMjFiN2Y3MjE2NWM3Y2MyZmRjZWFlOWMyZjA3Y2I1NmQ1MjE2NDA3MzVkMzlmNjg3OWEyMDNmIiwibWFuaWZlc3RTaGEyNTYiOiJmOWJkMDQ5ZTdjYzRjMDNmMjA2Yzk5YzJiYWQ5MmFlNTRiMzRkZWIyOGI0YjY5ODBhYmIxYmM0NDQzMmRmYjc1In0sImFjdGl2ZVJlY29yZFNoYTI1NiI6IjY4MTgzOGNlOGVhYWQ2MjVmYTA4MjMxZDcyMjUzMmU4MmU1OTVhMWMwMjA3YjkzMWYxMmUzZmIwNDA2ZTUyYmQiLCJiYWNrdXBPYnNlcnZhdGlvbiI6eyJiYWNrdXBDcnlwdG9JbXBvcnRPYnNlcnZlZCI6dHJ1ZSwiY29tbWFuZCI6eyJjdGltZU5zIjoiMTc4OTEyNDcwNjEwNTAxMDgwMyIsImRldmljZSI6NjQ1MTIsImdpZCI6MCwiaW5vZGUiOjQ1OTY1ODMsIm1vZGUiOjUxMSwibXRpbWVOcyI6IjE3ODkxMjQ3MDYxMDQ1ODg3NDUiLCJubGluayI6MSwicGF0aCI6Ii91c3IvbG9jYWwvc2Jpbi9sZWV0cGx1cy1jb21wb3NlLWJhY2t1cCIsInNpemUiOjgyLCJzdGF0ZSI6IlBSRVNFTlQiLCJ0YXJnZXQiOiIvdXNyL2xvY2FsL2xpYi9sZWV0cGx1cy1jb21wb3NlLzM5OTg3NmI1NjBiNGFjNjExZWFlMzVlZTQyNWQ5OTQyMmZiMTQwYjkvYmFja3VwLnNoIiwidHlwZSI6InN5bWxpbmsiLCJ1aWQiOjB9LCJkYWlseUJhY2t1cFNoYTI1NiI6IjM3ZjEwOTc0MGZiMzMyNTg4M2I1YjI1NjQxMTIyMjdlNjc2ZDAyOTk5NTQ3YzZiODg4YTE5YTI5NThjNzJkNTciLCJzZXJ2aWNlIjp7IkFjdGl2ZVN0YXRlIjoiaW5hY3RpdmUiLCJDb250cm9sUElEIjoiMCIsIkV4ZWNTdGFydCI6InsgcGF0aD0vdXNyL2xvY2FsL3NiaW4vbGVldHBsdXMtY29tcG9zZS1iYWNrdXAgOyBhcmd2W109L3Vzci9sb2NhbC9zYmluL2xlZXRwbHVzLWNvbXBvc2UtYmFja3VwIDsgaWdub3JlX2Vycm9ycz1ubyA7IHN0YXJ0X3RpbWU9W1R1ZSAyMDI2LTA5LTI5IDAxOjAwOjAwIFVUQ10gOyBzdG9wX3RpbWU9W1R1ZSAyMDI2LTA5LTI5IDAxOjAzOjAwIFVUQ10gOyBwaWQ9Mzc1OTU1MSA7IGNvZGU9ZXhpdGVkIDsgc3RhdHVzPTAgfSIsIkxvYWRTdGF0ZSI6ImxvYWRlZCIsIk1haW5QSUQiOiIwIiwiUmVzdWx0Ijoic3VjY2VzcyJ9LCJ0aW1lciI6eyJBY3RpdmVTdGF0ZSI6ImFjdGl2ZSIsIkxhc3RUcmlnZ2VyVVNlYyI6IlR1ZSAyMDI2LTA5LTI5IDAxOjAwOjAwIFVUQyIsIkxvYWRTdGF0ZSI6ImxvYWRlZCIsIk5leHRFbGFwc2VVU2VjUmVhbHRpbWUiOiJXZWQgMjAyNi0wOS0zMCAwMTowMDowMCBVVEMiLCJVbml0RmlsZVN0YXRlIjoiZW5hYmxlZCJ9fSwiYmFzZWxpbmVTdW1tYXJ5U2hhMjU2IjoiN2RhYTAzOWM5ZGEwNmEwNDg4MmI5MDBjYjQ3YjlmOGVjN2VhY2M1NDBlNjE0MTM3N2M3M2FmNDRjNGUxNjlkYyIsImJvb3RJZCI6IjRiYmMzNDg4LTZhOWItNDliMS1iZWNmLWRiMGQ3ODQ0NjRmMCIsImNhY2hlRGlyZWN0b3J5Ijp7ImN0aW1lTnMiOiIxNzkwMzUyMzE1MzY2MjIxNjAyIiwiZGV2aWNlIjo2NDUxMiwiZ2lkIjowLCJpbm9kZSI6NTM3NzgwNiwibW9kZSI6NDQ4LCJtdGltZU5zIjoiMTc5MDM1MjMxNTM2NjIyMTYwMiIsIm5saW5rIjoyLCJwYXRoIjoiL3Vzci9sb2NhbC9saWIvbGVldHBsdXMtY29tcG9zZS9iMGNiZjNhNGYzMDJiMjk5NzYyZmEwNTVmM2JmZmUwMzc2YTkxMTgyL19fcHljYWNoZV9fIiwic2l6ZSI6NDA5Niwic3RhdGUiOiJQUkVTRU5UIiwidHlwZSI6ImRpcmVjdG9yeSIsInVpZCI6MH0sImNhY2hlTGVhZiI6eyJjdGltZU5zIjoiMTc5MDM1MjMxNTM2NjIyMTYwMiIsImRldmljZSI6NjQ1MTIsImdpZCI6MCwiaW5vZGUiOjUzNzc4MDcsIm1vZGUiOjM4NCwibXRpbWVOcyI6IjE3OTAzNTIzMTUzNjYyMjE2MDIiLCJubGluayI6MSwicGF0aCI6Ii91c3IvbG9jYWwvbGliL2xlZXRwbHVzLWNvbXBvc2UvYjBjYmYzYTRmMzAyYjI5OTc2MmZhMDU1ZjNiZmZlMDM3NmE5MTE4Mi9fX3B5Y2FjaGVfXy9iYWNrdXBfY3J5cHRvLmNweXRob24tMzE0LnB5YyIsInNoYTI1NiI6IjU1MDNjOWZmMWJkMDhkNzQ4NTkxZDUyZTNkNjAyYWNhMDI2MTdjNDZiMTJiZGRhOWIxNjE0YmZkYjI5NWFhZTQiLCJzaXplIjoxNDA0NSwic3RhdGUiOiJQUkVTRU5UIiwidHlwZSI6InJlZ3VsYXIiLCJ1aWQiOjB9LCJjb250cmFjdCI6IkxFRVRQTFVTX0IwX0NBQ0hFX1FVQVJBTlRJTkVfRVhBQ1RfVjEiLCJkZXN0aW5hdGlvblBhcmVudCI6eyJjdGltZU5zIjoiMTc5MDM1MDA2OTcxNTU3NDAwNyIsImRldmljZSI6NjQ1MTIsImdpZCI6MCwiaW5vZGUiOjI2NTY5OTEsIm1vZGUiOjQ0OCwibXRpbWVOcyI6IjE3OTAzNTAwNjk3MTU1NzQwMDciLCJubGluayI6MzIsInBhdGgiOiIvc3J2L2xlZXRwbHVzLW9wZXJhdGlvbnMiLCJzaXplIjo0MDk2LCJzdGF0ZSI6IlBSRVNFTlQiLCJ0eXBlIjoiZGlyZWN0b3J5IiwidWlkIjowfSwiZWZmZWN0T3duZXJUaHJlYWRJZCI6IjAxYTBkMjU2LTQ1MTktNzkxMS04YWM0LWI1YzVmMDIwZDVmZiIsImVmZmVjdHMiOnsiYXBwbGljYXRpb25PckRhdGFNdXRhdGlvbiI6ZmFsc2UsImNvbnRyb2xsZXJQb2ludGVyTXV0YXRpb24iOmZhbHNlLCJkZWxldGlvbiI6ZmFsc2UsImR1cmFibGVGbGF0SW50ZW50Rmlyc3QiOnRydWUsImV4YWN0Tm9SZXBsYWNlQ2FjaGVEaXJlY3RvcnlSZW5hbWUiOnRydWUsInByb3ZpZGVyRWZmZWN0IjpmYWxzZSwic2VydmljZU9yVGltZXJNdXRhdGlvbiI6ZmFsc2UsInNvdXJjZUNvZGVNdXRhdGlvbiI6ZmFsc2UsInRlcm1pbmFsUmVjZWlwdExhc3QiOnRydWV9LCJleHBpcmVzQXQiOiIyMDI2LTA5LTI5VDEyOjA1OjAwWiIsImZ1dHVyZVRyYW5zcG9ydFJ1bGUiOiJUaGlzIEdPIGNvdmVycyBxdWFyYW50aW5lIG9ubHkuIExhdGVyIFRSQU5TUE9SVF9WMiByZXF1aXJlcyBmcmVzaCBleGFjdCBjYWNoZS1hYnNlbnQgYjAgcm9vdCBwcmVpbWFnZSwgaW5kZXBlbmRlbnQgcGxhbiBhbmQgZGlyZWN0IEdPLiBPbGQgVVVJRDlhZmMgaXMgY29uc3VtZWQuIiwiaGFuZG9mZlBvaW50ZXJTaGEyNTYiOiI5MjlmMDBmMjUzNzFkZmU3YjA3NjgzODRjZTY2YmE3OGFlZmM5ZGUwMTFlZDVkMGM0YWMwOTU2ZmVjMGNkNjU1IiwiaG9zdElkZW50aXR5U2hhMjU2IjoiZGU3MmQ0NDRkOTI2NmU2YzRmMWFjN2U3NmYwZDRlNGUwODY2Y2ExZGE0YWEwYTdmMjgwODgzNWZhM2JkMzQyMyIsImludGVudFBhdGgiOiIvc3J2L2xlZXRwbHVzLW9wZXJhdGlvbnMvYjAtY2FjaGUtcXVhcmFudGluZS1hYzg3MWNlYS1kMDZmLTQwMmMtYjVjMS02MGY5YzExMjc4NGUuaW50ZW50Lmpzb24iLCJpbnRlcnByZXRlciI6eyJpZGVudGl0eSI6eyJjdGltZU5zIjoiMTc4ODkzNDU2MzU2NzIzMDQ0NyIsImRldmljZSI6NjQ1MTIsImdpZCI6MCwiaW5vZGUiOjQ0NTg1MDUsIm1vZGUiOjQ5MywibXRpbWVOcyI6IjE3ODcyMjI1MTgwMDAwMDAwMDAiLCJubGluayI6MSwicGF0aCI6Ii91c3IvYmluL3B5dGhvbjMuMTQiLCJzaXplIjo3NDc3MTYwLCJzdGF0ZSI6IlBSRVNFTlQiLCJ0eXBlIjoicmVndWxhciIsInVpZCI6MH0sImxpbmsiOiIvdXNyL2Jpbi9weXRob24zIiwicmVhbHBhdGgiOiIvdXNyL2Jpbi9weXRob24zLjE0Iiwic2hhMjU2IjoiNTJlMGExM2U2MGE5ODFkOGM0YjY0NzhiZTJiYTUxNzZmNjlkYTA3OTQ4YTA1NmJmNDljZjZmMDc3ZTMwY2I0MSJ9LCJpbnZvY2F0aW9uIjp7ImdhdGVNb2RlIjoiY3J5cHRvLXJvb3QtYXBwcm92ZWQtY2FwdHVyZWQtcHl0aG9uIiwibG9jYWxLbm93bkhvc3RzU2hhMjU2IjoiYTgzZDQ3ZWQ5Mzc4ODZmYTdkNWY2M2IzZjYxZGM0OWQ2NTE0YmJmZDM5YTAyOGQxM2QxOTc4OWQ5OWI4MDE5MSIsImxvY2FsU3NoRXhlU2hhMjU2IjoiNzg2ZmYxNGJlN2NkNjUyYjJiOTc3MGE1N2U5YjFhYTVlMDNhMDUyY2UzYTNkNjQxZmI0NzYwYzBmZjNmZGUwNSIsInJlbW90ZUFyZ3YiOlsiL3Vzci9iaW4vZW52IiwiLWkiLCJQQVRIPS91c3Ivc2JpbjovdXNyL2Jpbjovc2JpbjovYmluIiwiTEFORz1DLlVURi04IiwiTENfQUxMPUMuVVRGLTgiLCJUWj1VVEMiLCIvdXNyL2Jpbi9ub2RlIiwiLS1pbnB1dC10eXBlPW1vZHVsZSIsIi1lIiwiPFBST1RFQ1RFRF9DQVBUVVJFRF9OT0RFX0dBVEU+Il0sInRyYW5zcG9ydCI6InBpbm5lZCBTU0ggc3RkaW4gY2FwdHVyZWQgUHl0aG9uIn0sImxpbWl0cyI6eyJsb2NrV2FpdFNlY29uZHMiOjMwLCJtYXhDYWNoZUxlYWZCeXRlcyI6MTA0ODU3NiwidG90YWxTZWNvbmRzIjoxODB9LCJsb2NhbEJ5dGVCYWNrdXAiOnsiYnl0ZXMiOjE0MDQ1LCJwYXRoIjoiQzpcXFVzZXJzXFxBTElFTldBUkVcXERvY3VtZW50c1xcTmV3IHByb2plY3RcXGRlcGxveS1ldmlkZW5jZVxcYi1icmlkZ2UtZGlzcGF0Y2hlci0yMDI2MDkyNVxcbWFpbjdiNTMtY2FjaGUtcXVhcmFudGluZS1wcmVpbWFnZS12My0wMS5sZWFmLmJpbiIsInNoYTI1NiI6IjU1MDNjOWZmMWJkMDhkNzQ4NTkxZDUyZTNkNjAyYWNhMDI2MTdjNDZiMTJiZGRhOWIxNjE0YmZkYjI5NWFhZTQifSwibmF0aXZlQ29udHJvbExvY2siOnsiY3RpbWVOcyI6IjE3ODkwNjMwNjYzMzIzNDcwMTciLCJkZXZpY2UiOjY0NTEyLCJnaWQiOjAsImlub2RlIjoxMTg0MzQwLCJtb2RlIjozODQsIm10aW1lTnMiOiIxNzg5MDYzMDY2MzMyMzQ3MDE3IiwibmxpbmsiOjEsInBhdGgiOiIvdmFyL2xpYi9sZWV0cGx1cy1jb21wb3NlL2NvbnRyb2wubG9jayIsInNpemUiOjAsInN0YXRlIjoiUFJFU0VOVCIsInR5cGUiOiJyZWd1bGFyIiwidWlkIjowfSwibm9kZUludGVycHJldGVyIjp7ImxpbmsiOiIvdXNyL2Jpbi9ub2RlIiwicmVhbHBhdGgiOiIvdXNyL2Jpbi9ub2RlIiwic2hhMjU2IjoiZDBlZmI2ZmNiOWQwMjNiYTRlMmIxNjBlYzIzODRkYzI4ZmU0ZjE3NzMyMTQxZWY0N2Y2NzY4MjhmYTk2MDUwNSJ9LCJub3RCZWZvcmVBdCI6IjIwMjYtMDktMjlUMTE6NDA6MDBaIiwib3BlcmF0aW9uSWQiOiJhYzg3MWNlYS1kMDZmLTQwMmMtYjVjMS02MGY5YzExMjc4NGUiLCJwcm9kdWN0aW9uQXV0aG9yaXplZCI6ZmFsc2UsInB1YmxpY1Jvb3RTaGEyNTYiOiJhNDkyMjdjMTU3ZmRiMDIxOTNhNmM5N2JiZDU2NjY5Njk0MzJiMjIxYjM5M2JlZTdlN2IwOWJkNGM4MjU1ZjVlIiwicXVhcmFudGluZURpcmVjdG9yeSI6Ii9zcnYvbGVldHBsdXMtb3BlcmF0aW9ucy9iMC1jYWNoZS1xdWFyYW50aW5lLWFjODcxY2VhLWQwNmYtNDAyYy1iNWMxLTYwZjljMTEyNzg0ZSIsInJlY2VpcHRQYXRoIjoiL3Nydi9sZWV0cGx1cy1vcGVyYXRpb25zL2IwLWNhY2hlLXF1YXJhbnRpbmUtYWM4NzFjZWEtZDA2Zi00MDJjLWI1YzEtNjBmOWMxMTI3ODRlLnJlY2VpcHQuanNvbiIsInJlY29uY2lsZVJ1bGUiOiJBbnkgYW1iaWd1b3VzIG9yIHBhcnRpYWwgcmVzcG9uc2UgaXMgVU5LTk9XTi4gUmVhZC1vbmx5IGNsYXNzaWZ5IGZsYXQgaW50ZW50L3NvdXJjZS9kZXN0aW5hdGlvbi90ZXJtaW5hbCByZWNlaXB0LCBuZXZlciByZXBsYXkgcmVuYW1lIG9yIGNyZWF0ZSBhIHJlY2VpcHQgd2l0aG91dCBzZXBhcmF0ZSBleGFjdCBHTy4iLCJzZXJ2aW5nUG9pbnRlciI6eyJjdGltZU5zIjoiMTc5MDMyODY5MDgyODcyMTA2MSIsImRldmljZSI6NjQ1MTIsImdpZCI6MCwiaW5vZGUiOjQ1OTI1MDgsIm1vZGUiOjUxMSwibXRpbWVOcyI6IjE3OTAzMjg2OTA4Mjg3MjEwNjEiLCJubGluayI6MSwicGF0aCI6Ii91c3IvbG9jYWwvc2Jpbi9sZWV0cGx1cy1jb21wb3NlIiwic2l6ZSI6ODMsInN0YXRlIjoiUFJFU0VOVCIsInRhcmdldCI6Ii91c3IvbG9jYWwvbGliL2xlZXRwbHVzLWNvbXBvc2UvYjBjYmYzYTRmMzAyYjI5OTc2MmZhMDU1ZjNiZmZlMDM3NmE5MTE4Mi9jb250cm9sLnNoIiwidHlwZSI6InN5bWxpbmsiLCJ1aWQiOjB9LCJzb3VyY2VEaXJlY3RvcnkiOiIvdXNyL2xvY2FsL2xpYi9sZWV0cGx1cy1jb21wb3NlL2IwY2JmM2E0ZjMwMmIyOTk3NjJmYTA1NWYzYmZmZTAzNzZhOTExODIvX19weWNhY2hlX18iLCJzb3VyY2VNYWluU2hhIjoiN2I1M2U1YWRhOTU0NmZkNTUxNTY1NzAxY2M5OTViMGRhMzk2ODM3MiIsInNvdXJjZVBhcmVudCI6eyJjdGltZU5zIjoiMTc5MDM1MjMxNTM2NTIzOTMxOSIsImRldmljZSI6NjQ1MTIsImdpZCI6MCwiaW5vZGUiOjUzNzc1NzMsIm1vZGUiOjQ0OCwibXRpbWVOcyI6IjE3OTAzNTIzMTUzNjUyMzkzMTkiLCJubGluayI6MywicGF0aCI6Ii91c3IvbG9jYWwvbGliL2xlZXRwbHVzLWNvbXBvc2UvYjBjYmYzYTRmMzAyYjI5OTc2MmZhMDU1ZjNiZmZlMDM3NmE5MTE4MiIsInNpemUiOjQwOTYsInN0YXRlIjoiUFJFU0VOVCIsInR5cGUiOiJkaXJlY3RvcnkiLCJ1aWQiOjB9LCJzdGFnZWRCcmlkZ2VJbnN0YWxsIjp7ImRpcmVjdG9yeUlkZW50aXR5Ijp7ImN0aW1lTnMiOiIxNzkwMzUyMDQwNTM3MDk5NDgxIiwiZGV2aWNlIjo2NDUxMiwiZ2lkIjowLCJpbm9kZSI6NTM3NzY4NiwibW9kZSI6NDQ4LCJtdGltZU5zIjoiMTc5MDM1MjA0MDUzNzA5OTQ4MSIsIm5saW5rIjoyLCJwYXRoIjoiL3Vzci9sb2NhbC9saWIvbGVldHBsdXMtY29tcG9zZS9iZWJlYjQxMzU0ZGEwZGQwNGIyMTg0OTVjYmJmNWQ3NWJhOWYwYTg1Iiwic2l6ZSI6NDA5Niwic3RhdGUiOiJQUkVTRU5UIiwidHlwZSI6ImRpcmVjdG9yeSIsInVpZCI6MH0sImZpbGVDb3VudCI6MTAxLCJmdWxsRmlsZU1hcFNoYTI1NiI6ImZjYjIwOWMwZGQ0YjIyYTI2YTE3YjlhYzY0MjUwODJjYjc5ZTJjM2U0MWZkNGFhMmQ2YzY1NGQ3NzkwYTdiZDciLCJtYW5pZmVzdFNoYTI1NiI6IjM5YTQ5NDFkZmNjYzdiNjY5NWQ0ZDViMDkyM2NjYWY5MzM0OTBiY2NiNmExMGU0MDE2OGUwNDM1Nzc3MzhkNDgifX0K'
APPROVAL_EXPIRY = None
SIGNED_APPROVAL = None

def require(ok, reason):
    if not ok:
        raise RuntimeError(reason)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def canonical(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False) + '\n').encode('utf-8')

def meta(path):
    try: s = path.lstat()
    except FileNotFoundError: return {'state': 'ABSENT'}
    kind = 'directory' if stat.S_ISDIR(s.st_mode) else 'regular' if stat.S_ISREG(s.st_mode) else 'symlink' if stat.S_ISLNK(s.st_mode) else 'other'
    return {'state':'PRESENT','type':kind,'path':str(path),'device':s.st_dev,'inode':s.st_ino,'ctimeNs':str(s.st_ctime_ns),'mtimeNs':str(s.st_mtime_ns),'uid':s.st_uid,'gid':s.st_gid,'mode':stat.S_IMODE(s.st_mode),'nlink':s.st_nlink,'size':s.st_size}

def same_stable(actual, expected):
    keys = ('state','type','path','device','inode','ctimeNs','mtimeNs','uid','gid','mode','nlink','size')
    return all(actual.get(k) == expected.get(k) for k in keys)

def safe_read(path, maximum):
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_uid == before.st_gid == 0 and before.st_nlink == 1 and before.st_size <= maximum and not before.st_mode & 0o022, 'unsafe read ' + str(path))
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC)
    try:
        opened = os.fstat(fd)
        require((opened.st_dev,opened.st_ino,opened.st_size,opened.st_ctime_ns,opened.st_mtime_ns) == (before.st_dev,before.st_ino,before.st_size,before.st_ctime_ns,before.st_mtime_ns), 'read open race')
        raw = bytearray()
        while len(raw) <= maximum:
            chunk = os.read(fd, min(65536, maximum + 1 - len(raw)))
            if not chunk: break
            raw.extend(chunk)
        after = os.fstat(fd)
        final = path.lstat()
        require(len(raw) == before.st_size and len(raw) <= maximum and (after.st_dev,after.st_ino,after.st_size,after.st_ctime_ns,after.st_mtime_ns) == (before.st_dev,before.st_ino,before.st_size,before.st_ctime_ns,before.st_mtime_ns) and (final.st_dev,final.st_ino,final.st_ctime_ns) == (before.st_dev,before.st_ino,before.st_ctime_ns), 'read changed')
        return bytes(raw)
    finally: os.close(fd)

def absent(path):
    return meta(path)['state'] == 'ABSENT'

def open_directory(path, expected):
    for ancestor in reversed(path.parents):
        if str(ancestor) == '/':
            continue
        upper = meta(ancestor)
        require(upper['type'] == 'directory' and upper['uid'] == 0 and not upper['mode'] & 0o022, 'untrusted directory ancestor ' + str(ancestor))
    observed = meta(path)
    require(same_stable(observed, expected) and observed['type'] == 'directory' and observed['uid'] == 0 and not observed['mode'] & 0o022, 'directory preimage ' + str(path))
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
    current = os.fstat(fd)
    require((current.st_dev,current.st_ino,current.st_ctime_ns) == (observed['device'],observed['inode'],int(observed['ctimeNs'])), 'directory open race')
    require(same_stable(meta(path), observed), 'directory path changed after open')
    return fd

def held_cache_preimage(parent_fd, origin, leaf, plan):
    cache_fd = os.open(origin.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent_fd)
    try:
        s = os.fstat(cache_fd)
        expected = plan['cacheDirectory']
        require((s.st_dev,s.st_ino,s.st_ctime_ns,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink) == (expected['device'],expected['inode'],int(expected['ctimeNs']),0,0,0o700,expected['nlink']), 'held cache identity')
        require(set(os.listdir(cache_fd)) == {leaf.name}, 'held cache leaf set')
        leaf_fd = os.open(leaf.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=cache_fd)
        try:
            before = os.fstat(leaf_fd)
            target = plan['cacheLeaf']
            require(stat.S_ISREG(before.st_mode) and (before.st_dev,before.st_ino,before.st_ctime_ns,before.st_size,before.st_uid,before.st_gid,stat.S_IMODE(before.st_mode),before.st_nlink) == (target['device'],target['inode'],int(target['ctimeNs']),target['size'],0,0,0o600,1), 'held leaf identity')
            raw = bytearray()
            while len(raw) <= plan['limits']['maxCacheLeafBytes']:
                chunk = os.read(leaf_fd, min(65536,plan['limits']['maxCacheLeafBytes']+1-len(raw)))
                if not chunk: break
                raw.extend(chunk)
            after = os.fstat(leaf_fd)
            visible = os.stat(leaf.name, dir_fd=cache_fd, follow_symlinks=False)
            require(len(raw) == target['size'] and sha(raw) == target['sha256'] and (after.st_dev,after.st_ino,after.st_ctime_ns,after.st_size) == (before.st_dev,before.st_ino,before.st_ctime_ns,before.st_size) and (visible.st_dev,visible.st_ino,visible.st_ctime_ns) == (before.st_dev,before.st_ino,before.st_ctime_ns), 'held leaf changed')
        finally: os.close(leaf_fd)
        return cache_fd
    except Exception:
        os.close(cache_fd)
        raise

def check_install_map(root, expected, manifest_sha, count, extra):
    raw = safe_read(root / 'install-manifest.json', 65536)
    require(sha(raw) == manifest_sha, 'install manifest changed')
    m = json.loads(raw)
    require(m.get('releaseSha') == root.name and isinstance(m.get('files'), dict) and len(m['files']) == count, 'install manifest identity')
    require({p.name for p in root.iterdir()} == set(m['files']) | {'install-manifest.json'} | extra, 'install root entry set')
    observed = {}
    for name, digest in m['files'].items():
        require(re.fullmatch(r'[A-Za-z0-9_.@-]+', name) is not None and name not in ('.','..'), 'invalid install leaf')
        require(sha(safe_read(root / name, 2 * 1024 * 1024)) == digest, 'installed file changed ' + name)
        observed[name] = digest
    summary_sha = sha(canonical(observed))
    require(summary_sha == expected['fullFileMapSha256'], 'installed map digest')
    return summary_sha

def timer_idle(plan):
    def show(unit, keys):
        expected_parent = os.getpid()
        def child_setup():
            os.setsid()
            require(os.getppid() == expected_parent and ctypes.CDLL(None,use_errno=True).prctl(1,signal.SIGKILL,0,0,0) == 0 and os.getppid() == expected_parent, 'systemctl parent-death')
        process = subprocess.Popen(['/usr/bin/systemctl','show',unit,'--property='+','.join(keys)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,preexec_fn=child_setup,close_fds=True,env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LANG':'C.UTF-8','LC_ALL':'C.UTF-8','TZ':'UTC'})
        selector = selectors.DefaultSelector()
        selector.register(process.stdout,selectors.EVENT_READ)
        selector.register(process.stderr,selectors.EVENT_READ)
        chunks = {process.stdout:bytearray(),process.stderr:bytearray()}
        until = time.monotonic() + 15
        try:
            while selector.get_map():
                require(time.monotonic() < until, 'systemd timeout')
                for key,_ in selector.select(timeout=max(0,until-time.monotonic())):
                    part = os.read(key.fileobj.fileno(),4096)
                    if not part:
                        selector.unregister(key.fileobj)
                    else:
                        chunks[key.fileobj].extend(part)
                        require(len(chunks[key.fileobj]) <= 16384, 'systemd output bound')
            require(process.wait(timeout=max(0,until-time.monotonic())) == 0, 'systemd observation')
            return dict(line.split('=',1) for line in chunks[process.stdout].decode().splitlines() if '=' in line)
        finally:
            selector.close()
            if process.poll() is None:
                try:os.killpg(process.pid,signal.SIGKILL)
                except ProcessLookupError:pass
                process.wait(timeout=5)
    service = show('leetplus-compose-backup.service',('LoadState','ActiveState','MainPID','ControlPID','Result','ExecStart'))
    timer = show('leetplus-compose-backup.timer',('LoadState','ActiveState','UnitFileState','NextElapseUSecRealtime','LastTriggerUSec'))
    require(service['ActiveState'] == 'inactive' and service['MainPID'] == service['ControlPID'] == '0', 'backup service active')
    require(service['ExecStart'] == plan['backupObservation']['service']['ExecStart'], 'backup service invocation changed')
    require(timer == plan['backupObservation']['timer'], 'backup timer changed')
    require(os.readlink('/usr/local/sbin/leetplus-compose-backup') == plan['backupObservation']['command']['target'], 'backup command target changed')
    require(sha(safe_read(pathlib.Path('/usr/local/lib/leetplus-compose/b0cbf3a4f302b299762fa055f3bffe0376a91182/daily-backup.py'),2*1024*1024)) == plan['backupObservation']['dailyBackupSha256'], 'b0 backup import source changed')
    return service, timer

def write_exclusive(parent_fd, name, raw):
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o400, dir_fd=parent_fd)
    try:
        offset = 0
        while offset < len(raw):
            n = os.write(fd, raw[offset:])
            require(n > 0, 'short durable write')
            offset += n
        os.fsync(fd)
    finally: os.close(fd)
    os.fsync(parent_fd)

def check_deadline(plan, start):
    now = dt.datetime.now(dt.timezone.utc)
    require(now < dt.datetime.fromisoformat(plan['expiresAt'].replace('Z','+00:00')), 'plan expired')
    require(APPROVAL_EXPIRY is not None and now < APPROVAL_EXPIRY, 'signed approval expired')
    require(time.monotonic() - start < plan['limits']['totalSeconds'], 'total deadline')
    return now.isoformat().replace('+00:00','Z')

def main():
    global APPROVAL_EXPIRY, SIGNED_APPROVAL
    require(sys.flags.optimize == 0 and sys.flags.isolated == 1 and sys.dont_write_bytecode and os.geteuid() == 0, 'protected interpreter flags/root')
    require(len(sys.argv) == 6 and sys.argv[5].isdigit() and int(sys.argv[5]) > 1, 'protected parent PID required')
    parent_pid = int(sys.argv[5])
    require(os.getppid() == parent_pid, 'parent changed before watchdog')
    libc = ctypes.CDLL(None, use_errno=True)
    require(libc.prctl(1, signal.SIGKILL, 0, 0, 0) == 0 and os.getppid() == parent_pid, 'parent-death watchdog')
    signal.alarm(180)
    start = time.monotonic()
    plan_raw = base64.b64decode(PLAN_B64, validate=True)
    plan = json.loads(plan_raw)
    plan_sha = sha(plan_raw)
    require(plan_raw == canonical(plan) and plan['contract'] == 'LEETPLUS_B0_CACHE_QUARANTINE_EXACT_V1' and plan['operationId'] == 'ac871cea-d06f-402c-b5c1-60f9c112784e', 'frozen plan')
    require(set(plan) == {'contract','operationId','effectOwnerThreadId','sourceMainSha','hostIdentitySha256','bootId','notBeforeAt','expiresAt','baselineSummarySha256','sourceDirectory','quarantineDirectory','intentPath','receiptPath','sourceParent','destinationParent','cacheDirectory','cacheLeaf','acceptedInstall','stagedBridgeInstall','servingPointer','activeRecordSha256','handoffPointerSha256','nativeControlLock','publicRootSha256','interpreter','nodeInterpreter','backupObservation','localByteBackup','limits','effects','invocation','reconcileRule','futureTransportRule','productionAuthorized'}, 'closed plan fields')
    require(plan['productionAuthorized'] is False and plan['effectOwnerThreadId'] == '01a0d256-4519-7911-8ac4-b5c5f020d5ff' and plan['sourceMainSha'] == '7b53e5ada9546fd551565701cc995b0da3968372', 'plan owner/source')
    require(plan['limits'] == {'lockWaitSeconds':30,'totalSeconds':180,'maxCacheLeafBytes':1048576}, 'closed limits')
    require(plan['effects'] == {'durableFlatIntentFirst':True,'exactNoReplaceCacheDirectoryRename':True,'terminalReceiptLast':True,'deletion':False,'sourceCodeMutation':False,'controllerPointerMutation':False,'applicationOrDataMutation':False,'serviceOrTimerMutation':False,'providerEffect':False}, 'closed effects')
    require(sys.argv[1] == '--effect' and sys.argv[2] == plan_sha and re.fullmatch(r'[0-9a-f]{64}', sys.argv[3]) is not None, 'direct GO receipt digest required')
    go_sha = sys.argv[3]
    signed_raw = base64.b64decode(sys.argv[4], validate=True)
    require(len(signed_raw) <= 16384, 'signed approval argv bound')
    SIGNED_APPROVAL = json.loads(signed_raw)
    require(signed_raw == canonical(SIGNED_APPROVAL) and set(SIGNED_APPROVAL) == {'approval','signatureBase64'}, 'canonical signed approval record')
    signed = SIGNED_APPROVAL['approval']
    require(signed['planSha256'] == plan_sha and signed['operationId'] == plan['operationId'] and signed['directUserGoReceiptSha256'] == go_sha and signed['baselineSummarySha256'] == plan['baselineSummarySha256'], 'trusted-gate approval binding')
    APPROVAL_EXPIRY = dt.datetime.fromisoformat(signed['expiresAt'].replace('Z','+00:00'))
    authorized_at = dt.datetime.fromisoformat(signed['authorizedAt'].replace('Z','+00:00'))
    require(dt.datetime.now(dt.timezone.utc) >= authorized_at and dt.timedelta(0) < APPROVAL_EXPIRY-authorized_at <= dt.timedelta(minutes=30), 'signed 30 minute window')
    require(sha(pathlib.Path('/etc/machine-id').read_bytes().strip()) == plan['hostIdentitySha256'] and pathlib.Path('/proc/sys/kernel/random/boot_id').read_text().strip() == plan['bootId'], 'host/boot')
    require(dt.datetime.now(dt.timezone.utc) >= dt.datetime.fromisoformat(plan['notBeforeAt'].replace('Z','+00:00')), 'premature plan')
    check_deadline(plan, start)
    py = pathlib.Path('/usr/bin/python3').resolve(strict=True)
    require(str(py) == plan['interpreter']['realpath'] and sha(safe_read(py, 64*1024*1024)) == plan['interpreter']['sha256'], 'interpreter drift')
    root_pem = pathlib.Path('/etc/leetplus-compose/approval-root.pem')
    require(sha(safe_read(root_pem,4096)) == plan['publicRootSha256'], 'public root drift')
    origin = pathlib.Path(plan['sourceDirectory'])
    leaf = origin / 'backup_crypto.cpython-314.pyc'
    source_parent = origin.parent
    destination = pathlib.Path(plan['quarantineDirectory'])
    destination_parent = destination.parent
    intent = pathlib.Path(plan['intentPath'])
    receipt = pathlib.Path(plan['receiptPath'])
    require(destination_parent == intent.parent == receipt.parent and destination.name + '.intent.json' == intent.name and destination.name + '.receipt.json' == receipt.name, 'closed effect paths')
    require(plan['sourceDirectory'] == '/usr/local/lib/leetplus-compose/b0cbf3a4f302b299762fa055f3bffe0376a91182/__pycache__' and plan['quarantineDirectory'] == '/srv/leetplus-operations/b0-cache-quarantine-' + plan['operationId'], 'effect scope')
    lock_path = pathlib.Path('/var/lib/leetplus-compose/control.lock')
    lock_before = meta(lock_path)
    require(same_stable(lock_before, plan['nativeControlLock']) and lock_before['mode'] == 0o600 and lock_before['uid'] == lock_before['gid'] == 0 and lock_before['nlink'] == 1, 'native lock preimage')
    lock_fd = os.open(lock_path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    src_fd = dst_fd = cache_fd = -1
    try:
        st = os.fstat(lock_fd)
        require((st.st_dev,st.st_ino,st.st_ctime_ns) == (lock_before['device'],lock_before['inode'],int(lock_before['ctimeNs'])), 'native lock open race')
        wait_until = time.monotonic() + plan['limits']['lockWaitSeconds']
        while True:
            try: fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB); break
            except BlockingIOError:
                require(time.monotonic() < wait_until, 'native lock wait timeout')
                time.sleep(0.02)
        require(same_stable(meta(lock_path), lock_before), 'native lock changed after acquisition')
        src_fd = open_directory(source_parent, plan['sourceParent'])
        dst_fd = open_directory(destination_parent, plan['destinationParent'])
        require(os.fstat(src_fd).st_dev == os.fstat(dst_fd).st_dev == plan['sourceParent']['device'], 'rename not same filesystem')
        require(same_stable(meta(origin), plan['cacheDirectory']) and same_stable(meta(leaf), plan['cacheLeaf']), 'cache identity')
        cache_fd = held_cache_preimage(src_fd,origin,leaf,plan)
        require(absent(destination) and absent(intent) and absent(receipt), 'prior quarantine state requires reconcile')
        require(absent(pathlib.Path('/var/lib/leetplus-compose/control-handoff.pending.json')), 'native pending')
        core = pathlib.Path('/usr/local/sbin/leetplus-compose')
        require(same_stable(meta(core), plan['servingPointer']) and os.readlink(core) == plan['servingPointer']['target'], 'controller pointer drift')
        require(sha(safe_read(pathlib.Path('/var/lib/leetplus-compose/active.json'),65536)) == plan['activeRecordSha256'], 'active record drift')
        require(sha(safe_read(pathlib.Path('/var/lib/leetplus-compose/control-handoffs/active.json'),65536)) == plan['handoffPointerSha256'], 'native pointer drift')
        b0 = source_parent
        bridge = pathlib.Path('/usr/local/lib/leetplus-compose/bebeb41354da0dd04b218495cbbf5d75ba9f0a85')
        check_install_map(b0,plan['acceptedInstall'],plan['acceptedInstall']['manifestSha256'],99,{'__pycache__'})
        check_install_map(bridge,plan['stagedBridgeInstall'],plan['stagedBridgeInstall']['manifestSha256'],101,set())
        timer_idle(plan)
        require(hasattr(ctypes.CDLL(None,use_errno=True),'renameat2'), 'renameat2 unavailable')
        issued = check_deadline(plan,start)
        intent_record = {'contract':'LEETPLUS_B0_CACHE_QUARANTINE_INTENT_V1','operationId':plan['operationId'],'planSha256':plan_sha,'directGoReceiptSha256':go_sha,'signedApproval':SIGNED_APPROVAL,'signedApprovalSha256':sha(signed_raw),'sourceDirectory':str(origin),'quarantineDirectory':str(destination),'sourceDirectoryPreimage':plan['cacheDirectory'],'cacheLeafSha256':plan['cacheLeaf']['sha256'],'issuedAt':issued}
        intent_raw = canonical(intent_record)
        write_exclusive(dst_fd,intent.name,intent_raw)
        check_deadline(plan,start)
        require(same_stable(meta(source_parent), plan['sourceParent']) and same_stable(meta(origin), plan['cacheDirectory']) and same_stable(meta(leaf), plan['cacheLeaf']), 'source changed before rename')
        require((os.fstat(src_fd).st_dev,os.fstat(src_fd).st_ino) == (plan['sourceParent']['device'],plan['sourceParent']['inode']) and (os.fstat(dst_fd).st_dev,os.fstat(dst_fd).st_ino) == (plan['destinationParent']['device'],plan['destinationParent']['inode']), 'held parents changed before rename')
        require((os.fstat(cache_fd).st_dev,os.fstat(cache_fd).st_ino,os.fstat(cache_fd).st_ctime_ns) == (plan['cacheDirectory']['device'],plan['cacheDirectory']['inode'],int(plan['cacheDirectory']['ctimeNs'])) and set(os.listdir(cache_fd)) == {leaf.name} and absent(destination) and absent(receipt), 'held cache/destination changed before rename')
        rename = ctypes.CDLL(None,use_errno=True).renameat2
        rename.argtypes = [ctypes.c_int,ctypes.c_char_p,ctypes.c_int,ctypes.c_char_p,ctypes.c_uint]
        rename.restype = ctypes.c_int
        result = rename(src_fd,os.fsencode(origin.name),dst_fd,os.fsencode(destination.name),1)
        if result != 0:
            code = ctypes.get_errno()
            raise OSError(code, os.strerror(code), str(destination))
        os.fsync(src_fd); os.fsync(dst_fd)
        require(absent(origin), 'source cache remains after rename')
        moved = meta(destination)
        require(moved['type'] == 'directory' and (moved['device'],moved['inode'],moved['uid'],moved['gid'],moved['mode']) == (plan['cacheDirectory']['device'],plan['cacheDirectory']['inode'],0,0,0o700), 'quarantine identity')
        moved_leaf = meta(destination / leaf.name)
        require(moved_leaf['type'] == 'regular' and (moved_leaf['device'],moved_leaf['inode'],moved_leaf['ctimeNs'],moved_leaf['uid'],moved_leaf['gid'],moved_leaf['mode'],moved_leaf['size'],moved_leaf['nlink']) == (plan['cacheLeaf']['device'],plan['cacheLeaf']['inode'],plan['cacheLeaf']['ctimeNs'],0,0,0o600,plan['cacheLeaf']['size'],1) and sha(safe_read(destination / leaf.name,1024*1024)) == plan['cacheLeaf']['sha256'] and set(os.listdir(cache_fd)) == {leaf.name}, 'quarantine leaf identity')
        check_install_map(b0,plan['acceptedInstall'],plan['acceptedInstall']['manifestSha256'],99,set())
        require(sha(safe_read(pathlib.Path('/var/lib/leetplus-compose/active.json'),65536)) == plan['activeRecordSha256'] and sha(safe_read(pathlib.Path('/var/lib/leetplus-compose/control-handoffs/active.json'),65536)) == plan['handoffPointerSha256'] and absent(pathlib.Path('/var/lib/leetplus-compose/control-handoff.pending.json')) and os.readlink(core) == plan['servingPointer']['target'], 'post controller drift')
        complete = check_deadline(plan,start)
        receipt_record = {'contract':'LEETPLUS_B0_CACHE_QUARANTINE_RECEIPT_V1','decision':'EXACT_CACHE_QUARANTINED_NO_DELETION','operationId':plan['operationId'],'planSha256':plan_sha,'directGoReceiptSha256':go_sha,'signedApprovalSha256':sha(signed_raw),'intentSha256':sha(intent_raw),'sourceDirectoryAbsent':True,'quarantineDirectory':moved,'quarantineLeaf':{**moved_leaf,'sha256':plan['cacheLeaf']['sha256']},'acceptedInstallManifestSha256':plan['acceptedInstall']['manifestSha256'],'activeRecordSha256':plan['activeRecordSha256'],'handoffPointerSha256':plan['handoffPointerSha256'],'completedAt':complete}
        receipt_raw = canonical(receipt_record)
        write_exclusive(dst_fd,receipt.name,receipt_raw)
        print(json.dumps({'decision':receipt_record['decision'],'operationId':plan['operationId'],'planSha256':plan_sha,'intentSha256':sha(intent_raw),'receiptSha256':sha(receipt_raw),'sourceDirectoryAbsent':True,'quarantineDirectory':str(destination),'cacheLeafSha256':plan['cacheLeaf']['sha256'],'productionScope':'QUARANTINE_ONLY'},sort_keys=True),flush=True)
    finally:
        if cache_fd >= 0: os.close(cache_fd)
        if src_fd >= 0: os.close(src_fd)
        if dst_fd >= 0: os.close(dst_fd)
        os.close(lock_fd)

if __name__ == '__main__':
    main()
