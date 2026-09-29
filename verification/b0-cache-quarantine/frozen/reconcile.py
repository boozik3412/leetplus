"""Read-only classifier for one exact cache quarantine operation."""
import base64
import datetime as dt
import base64
import fcntl
import subprocess
import hashlib
import json
import os
import pathlib
import re
import signal
import stat
import sys
import time

PLAN_B64 = 'eyJhY2NlcHRlZEluc3RhbGwiOnsiZGlyZWN0b3J5SWRlbnRpdHkiOnsiY3RpbWVOcyI6IjE3OTAzNTIzMTUzNjUyMzkzMTkiLCJkZXZpY2UiOjY0NTEyLCJnaWQiOjAsImlub2RlIjo1Mzc3NTczLCJtb2RlIjo0NDgsIm10aW1lTnMiOiIxNzkwMzUyMzE1MzY1MjM5MzE5IiwibmxpbmsiOjMsInBhdGgiOiIvdXNyL2xvY2FsL2xpYi9sZWV0cGx1cy1jb21wb3NlL2IwY2JmM2E0ZjMwMmIyOTk3NjJmYTA1NWYzYmZmZTAzNzZhOTExODIiLCJzaXplIjo0MDk2LCJzdGF0ZSI6IlBSRVNFTlQiLCJ0eXBlIjoiZGlyZWN0b3J5IiwidWlkIjowfSwiZmlsZUNvdW50Ijo5OSwiZnVsbEZpbGVNYXBTaGEyNTYiOiI4NTMyMzc3ZDNlMjFiN2Y3MjE2NWM3Y2MyZmRjZWFlOWMyZjA3Y2I1NmQ1MjE2NDA3MzVkMzlmNjg3OWEyMDNmIiwibWFuaWZlc3RTaGEyNTYiOiJmOWJkMDQ5ZTdjYzRjMDNmMjA2Yzk5YzJiYWQ5MmFlNTRiMzRkZWIyOGI0YjY5ODBhYmIxYmM0NDQzMmRmYjc1In0sImFjdGl2ZVJlY29yZFNoYTI1NiI6IjY4MTgzOGNlOGVhYWQ2MjVmYTA4MjMxZDcyMjUzMmU4MmU1OTVhMWMwMjA3YjkzMWYxMmUzZmIwNDA2ZTUyYmQiLCJiYWNrdXBPYnNlcnZhdGlvbiI6eyJiYWNrdXBDcnlwdG9JbXBvcnRPYnNlcnZlZCI6dHJ1ZSwiY29tbWFuZCI6eyJjdGltZU5zIjoiMTc4OTEyNDcwNjEwNTAxMDgwMyIsImRldmljZSI6NjQ1MTIsImdpZCI6MCwiaW5vZGUiOjQ1OTY1ODMsIm1vZGUiOjUxMSwibXRpbWVOcyI6IjE3ODkxMjQ3MDYxMDQ1ODg3NDUiLCJubGluayI6MSwicGF0aCI6Ii91c3IvbG9jYWwvc2Jpbi9sZWV0cGx1cy1jb21wb3NlLWJhY2t1cCIsInNpemUiOjgyLCJzdGF0ZSI6IlBSRVNFTlQiLCJ0YXJnZXQiOiIvdXNyL2xvY2FsL2xpYi9sZWV0cGx1cy1jb21wb3NlLzM5OTg3NmI1NjBiNGFjNjExZWFlMzVlZTQyNWQ5OTQyMmZiMTQwYjkvYmFja3VwLnNoIiwidHlwZSI6InN5bWxpbmsiLCJ1aWQiOjB9LCJkYWlseUJhY2t1cFNoYTI1NiI6IjM3ZjEwOTc0MGZiMzMyNTg4M2I1YjI1NjQxMTIyMjdlNjc2ZDAyOTk5NTQ3YzZiODg4YTE5YTI5NThjNzJkNTciLCJzZXJ2aWNlIjp7IkFjdGl2ZVN0YXRlIjoiaW5hY3RpdmUiLCJDb250cm9sUElEIjoiMCIsIkV4ZWNTdGFydCI6InsgcGF0aD0vdXNyL2xvY2FsL3NiaW4vbGVldHBsdXMtY29tcG9zZS1iYWNrdXAgOyBhcmd2W109L3Vzci9sb2NhbC9zYmluL2xlZXRwbHVzLWNvbXBvc2UtYmFja3VwIDsgaWdub3JlX2Vycm9ycz1ubyA7IHN0YXJ0X3RpbWU9W1R1ZSAyMDI2LTA5LTI5IDAxOjAwOjAwIFVUQ10gOyBzdG9wX3RpbWU9W1R1ZSAyMDI2LTA5LTI5IDAxOjAzOjAwIFVUQ10gOyBwaWQ9Mzc1OTU1MSA7IGNvZGU9ZXhpdGVkIDsgc3RhdHVzPTAgfSIsIkxvYWRTdGF0ZSI6ImxvYWRlZCIsIk1haW5QSUQiOiIwIiwiUmVzdWx0Ijoic3VjY2VzcyJ9LCJ0aW1lciI6eyJBY3RpdmVTdGF0ZSI6ImFjdGl2ZSIsIkxhc3RUcmlnZ2VyVVNlYyI6IlR1ZSAyMDI2LTA5LTI5IDAxOjAwOjAwIFVUQyIsIkxvYWRTdGF0ZSI6ImxvYWRlZCIsIk5leHRFbGFwc2VVU2VjUmVhbHRpbWUiOiJXZWQgMjAyNi0wOS0zMCAwMTowMDowMCBVVEMiLCJVbml0RmlsZVN0YXRlIjoiZW5hYmxlZCJ9fSwiYmFzZWxpbmVTdW1tYXJ5U2hhMjU2IjoiN2RhYTAzOWM5ZGEwNmEwNDg4MmI5MDBjYjQ3YjlmOGVjN2VhY2M1NDBlNjE0MTM3N2M3M2FmNDRjNGUxNjlkYyIsImJvb3RJZCI6IjRiYmMzNDg4LTZhOWItNDliMS1iZWNmLWRiMGQ3ODQ0NjRmMCIsImNhY2hlRGlyZWN0b3J5Ijp7ImN0aW1lTnMiOiIxNzkwMzUyMzE1MzY2MjIxNjAyIiwiZGV2aWNlIjo2NDUxMiwiZ2lkIjowLCJpbm9kZSI6NTM3NzgwNiwibW9kZSI6NDQ4LCJtdGltZU5zIjoiMTc5MDM1MjMxNTM2NjIyMTYwMiIsIm5saW5rIjoyLCJwYXRoIjoiL3Vzci9sb2NhbC9saWIvbGVldHBsdXMtY29tcG9zZS9iMGNiZjNhNGYzMDJiMjk5NzYyZmEwNTVmM2JmZmUwMzc2YTkxMTgyL19fcHljYWNoZV9fIiwic2l6ZSI6NDA5Niwic3RhdGUiOiJQUkVTRU5UIiwidHlwZSI6ImRpcmVjdG9yeSIsInVpZCI6MH0sImNhY2hlTGVhZiI6eyJjdGltZU5zIjoiMTc5MDM1MjMxNTM2NjIyMTYwMiIsImRldmljZSI6NjQ1MTIsImdpZCI6MCwiaW5vZGUiOjUzNzc4MDcsIm1vZGUiOjM4NCwibXRpbWVOcyI6IjE3OTAzNTIzMTUzNjYyMjE2MDIiLCJubGluayI6MSwicGF0aCI6Ii91c3IvbG9jYWwvbGliL2xlZXRwbHVzLWNvbXBvc2UvYjBjYmYzYTRmMzAyYjI5OTc2MmZhMDU1ZjNiZmZlMDM3NmE5MTE4Mi9fX3B5Y2FjaGVfXy9iYWNrdXBfY3J5cHRvLmNweXRob24tMzE0LnB5YyIsInNoYTI1NiI6IjU1MDNjOWZmMWJkMDhkNzQ4NTkxZDUyZTNkNjAyYWNhMDI2MTdjNDZiMTJiZGRhOWIxNjE0YmZkYjI5NWFhZTQiLCJzaXplIjoxNDA0NSwic3RhdGUiOiJQUkVTRU5UIiwidHlwZSI6InJlZ3VsYXIiLCJ1aWQiOjB9LCJjb250cmFjdCI6IkxFRVRQTFVTX0IwX0NBQ0hFX1FVQVJBTlRJTkVfRVhBQ1RfVjEiLCJkZXN0aW5hdGlvblBhcmVudCI6eyJjdGltZU5zIjoiMTc5MDM1MDA2OTcxNTU3NDAwNyIsImRldmljZSI6NjQ1MTIsImdpZCI6MCwiaW5vZGUiOjI2NTY5OTEsIm1vZGUiOjQ0OCwibXRpbWVOcyI6IjE3OTAzNTAwNjk3MTU1NzQwMDciLCJubGluayI6MzIsInBhdGgiOiIvc3J2L2xlZXRwbHVzLW9wZXJhdGlvbnMiLCJzaXplIjo0MDk2LCJzdGF0ZSI6IlBSRVNFTlQiLCJ0eXBlIjoiZGlyZWN0b3J5IiwidWlkIjowfSwiZWZmZWN0T3duZXJUaHJlYWRJZCI6IjAxYTBkMjU2LTQ1MTktNzkxMS04YWM0LWI1YzVmMDIwZDVmZiIsImVmZmVjdHMiOnsiYXBwbGljYXRpb25PckRhdGFNdXRhdGlvbiI6ZmFsc2UsImNvbnRyb2xsZXJQb2ludGVyTXV0YXRpb24iOmZhbHNlLCJkZWxldGlvbiI6ZmFsc2UsImR1cmFibGVGbGF0SW50ZW50Rmlyc3QiOnRydWUsImV4YWN0Tm9SZXBsYWNlQ2FjaGVEaXJlY3RvcnlSZW5hbWUiOnRydWUsInByb3ZpZGVyRWZmZWN0IjpmYWxzZSwic2VydmljZU9yVGltZXJNdXRhdGlvbiI6ZmFsc2UsInNvdXJjZUNvZGVNdXRhdGlvbiI6ZmFsc2UsInRlcm1pbmFsUmVjZWlwdExhc3QiOnRydWV9LCJleHBpcmVzQXQiOiIyMDI2LTA5LTI5VDEyOjA1OjAwWiIsImZ1dHVyZVRyYW5zcG9ydFJ1bGUiOiJUaGlzIEdPIGNvdmVycyBxdWFyYW50aW5lIG9ubHkuIExhdGVyIFRSQU5TUE9SVF9WMiByZXF1aXJlcyBmcmVzaCBleGFjdCBjYWNoZS1hYnNlbnQgYjAgcm9vdCBwcmVpbWFnZSwgaW5kZXBlbmRlbnQgcGxhbiBhbmQgZGlyZWN0IEdPLiBPbGQgVVVJRDlhZmMgaXMgY29uc3VtZWQuIiwiaGFuZG9mZlBvaW50ZXJTaGEyNTYiOiI5MjlmMDBmMjUzNzFkZmU3YjA3NjgzODRjZTY2YmE3OGFlZmM5ZGUwMTFlZDVkMGM0YWMwOTU2ZmVjMGNkNjU1IiwiaG9zdElkZW50aXR5U2hhMjU2IjoiZGU3MmQ0NDRkOTI2NmU2YzRmMWFjN2U3NmYwZDRlNGUwODY2Y2ExZGE0YWEwYTdmMjgwODgzNWZhM2JkMzQyMyIsImludGVudFBhdGgiOiIvc3J2L2xlZXRwbHVzLW9wZXJhdGlvbnMvYjAtY2FjaGUtcXVhcmFudGluZS1hYzg3MWNlYS1kMDZmLTQwMmMtYjVjMS02MGY5YzExMjc4NGUuaW50ZW50Lmpzb24iLCJpbnRlcnByZXRlciI6eyJpZGVudGl0eSI6eyJjdGltZU5zIjoiMTc4ODkzNDU2MzU2NzIzMDQ0NyIsImRldmljZSI6NjQ1MTIsImdpZCI6MCwiaW5vZGUiOjQ0NTg1MDUsIm1vZGUiOjQ5MywibXRpbWVOcyI6IjE3ODcyMjI1MTgwMDAwMDAwMDAiLCJubGluayI6MSwicGF0aCI6Ii91c3IvYmluL3B5dGhvbjMuMTQiLCJzaXplIjo3NDc3MTYwLCJzdGF0ZSI6IlBSRVNFTlQiLCJ0eXBlIjoicmVndWxhciIsInVpZCI6MH0sImxpbmsiOiIvdXNyL2Jpbi9weXRob24zIiwicmVhbHBhdGgiOiIvdXNyL2Jpbi9weXRob24zLjE0Iiwic2hhMjU2IjoiNTJlMGExM2U2MGE5ODFkOGM0YjY0NzhiZTJiYTUxNzZmNjlkYTA3OTQ4YTA1NmJmNDljZjZmMDc3ZTMwY2I0MSJ9LCJpbnZvY2F0aW9uIjp7ImdhdGVNb2RlIjoiY3J5cHRvLXJvb3QtYXBwcm92ZWQtY2FwdHVyZWQtcHl0aG9uIiwibG9jYWxLbm93bkhvc3RzU2hhMjU2IjoiYTgzZDQ3ZWQ5Mzc4ODZmYTdkNWY2M2IzZjYxZGM0OWQ2NTE0YmJmZDM5YTAyOGQxM2QxOTc4OWQ5OWI4MDE5MSIsImxvY2FsU3NoRXhlU2hhMjU2IjoiNzg2ZmYxNGJlN2NkNjUyYjJiOTc3MGE1N2U5YjFhYTVlMDNhMDUyY2UzYTNkNjQxZmI0NzYwYzBmZjNmZGUwNSIsInJlbW90ZUFyZ3YiOlsiL3Vzci9iaW4vZW52IiwiLWkiLCJQQVRIPS91c3Ivc2JpbjovdXNyL2Jpbjovc2JpbjovYmluIiwiTEFORz1DLlVURi04IiwiTENfQUxMPUMuVVRGLTgiLCJUWj1VVEMiLCIvdXNyL2Jpbi9ub2RlIiwiLS1pbnB1dC10eXBlPW1vZHVsZSIsIi1lIiwiPFBST1RFQ1RFRF9DQVBUVVJFRF9OT0RFX0dBVEU+Il0sInRyYW5zcG9ydCI6InBpbm5lZCBTU0ggc3RkaW4gY2FwdHVyZWQgUHl0aG9uIn0sImxpbWl0cyI6eyJsb2NrV2FpdFNlY29uZHMiOjMwLCJtYXhDYWNoZUxlYWZCeXRlcyI6MTA0ODU3NiwidG90YWxTZWNvbmRzIjoxODB9LCJsb2NhbEJ5dGVCYWNrdXAiOnsiYnl0ZXMiOjE0MDQ1LCJwYXRoIjoiQzpcXFVzZXJzXFxBTElFTldBUkVcXERvY3VtZW50c1xcTmV3IHByb2plY3RcXGRlcGxveS1ldmlkZW5jZVxcYi1icmlkZ2UtZGlzcGF0Y2hlci0yMDI2MDkyNVxcbWFpbjdiNTMtY2FjaGUtcXVhcmFudGluZS1wcmVpbWFnZS12My0wMS5sZWFmLmJpbiIsInNoYTI1NiI6IjU1MDNjOWZmMWJkMDhkNzQ4NTkxZDUyZTNkNjAyYWNhMDI2MTdjNDZiMTJiZGRhOWIxNjE0YmZkYjI5NWFhZTQifSwibmF0aXZlQ29udHJvbExvY2siOnsiY3RpbWVOcyI6IjE3ODkwNjMwNjYzMzIzNDcwMTciLCJkZXZpY2UiOjY0NTEyLCJnaWQiOjAsImlub2RlIjoxMTg0MzQwLCJtb2RlIjozODQsIm10aW1lTnMiOiIxNzg5MDYzMDY2MzMyMzQ3MDE3IiwibmxpbmsiOjEsInBhdGgiOiIvdmFyL2xpYi9sZWV0cGx1cy1jb21wb3NlL2NvbnRyb2wubG9jayIsInNpemUiOjAsInN0YXRlIjoiUFJFU0VOVCIsInR5cGUiOiJyZWd1bGFyIiwidWlkIjowfSwibm9kZUludGVycHJldGVyIjp7ImxpbmsiOiIvdXNyL2Jpbi9ub2RlIiwicmVhbHBhdGgiOiIvdXNyL2Jpbi9ub2RlIiwic2hhMjU2IjoiZDBlZmI2ZmNiOWQwMjNiYTRlMmIxNjBlYzIzODRkYzI4ZmU0ZjE3NzMyMTQxZWY0N2Y2NzY4MjhmYTk2MDUwNSJ9LCJub3RCZWZvcmVBdCI6IjIwMjYtMDktMjlUMTE6NDA6MDBaIiwib3BlcmF0aW9uSWQiOiJhYzg3MWNlYS1kMDZmLTQwMmMtYjVjMS02MGY5YzExMjc4NGUiLCJwcm9kdWN0aW9uQXV0aG9yaXplZCI6ZmFsc2UsInB1YmxpY1Jvb3RTaGEyNTYiOiJhNDkyMjdjMTU3ZmRiMDIxOTNhNmM5N2JiZDU2NjY5Njk0MzJiMjIxYjM5M2JlZTdlN2IwOWJkNGM4MjU1ZjVlIiwicXVhcmFudGluZURpcmVjdG9yeSI6Ii9zcnYvbGVldHBsdXMtb3BlcmF0aW9ucy9iMC1jYWNoZS1xdWFyYW50aW5lLWFjODcxY2VhLWQwNmYtNDAyYy1iNWMxLTYwZjljMTEyNzg0ZSIsInJlY2VpcHRQYXRoIjoiL3Nydi9sZWV0cGx1cy1vcGVyYXRpb25zL2IwLWNhY2hlLXF1YXJhbnRpbmUtYWM4NzFjZWEtZDA2Zi00MDJjLWI1YzEtNjBmOWMxMTI3ODRlLnJlY2VpcHQuanNvbiIsInJlY29uY2lsZVJ1bGUiOiJBbnkgYW1iaWd1b3VzIG9yIHBhcnRpYWwgcmVzcG9uc2UgaXMgVU5LTk9XTi4gUmVhZC1vbmx5IGNsYXNzaWZ5IGZsYXQgaW50ZW50L3NvdXJjZS9kZXN0aW5hdGlvbi90ZXJtaW5hbCByZWNlaXB0LCBuZXZlciByZXBsYXkgcmVuYW1lIG9yIGNyZWF0ZSBhIHJlY2VpcHQgd2l0aG91dCBzZXBhcmF0ZSBleGFjdCBHTy4iLCJzZXJ2aW5nUG9pbnRlciI6eyJjdGltZU5zIjoiMTc5MDMyODY5MDgyODcyMTA2MSIsImRldmljZSI6NjQ1MTIsImdpZCI6MCwiaW5vZGUiOjQ1OTI1MDgsIm1vZGUiOjUxMSwibXRpbWVOcyI6IjE3OTAzMjg2OTA4Mjg3MjEwNjEiLCJubGluayI6MSwicGF0aCI6Ii91c3IvbG9jYWwvc2Jpbi9sZWV0cGx1cy1jb21wb3NlIiwic2l6ZSI6ODMsInN0YXRlIjoiUFJFU0VOVCIsInRhcmdldCI6Ii91c3IvbG9jYWwvbGliL2xlZXRwbHVzLWNvbXBvc2UvYjBjYmYzYTRmMzAyYjI5OTc2MmZhMDU1ZjNiZmZlMDM3NmE5MTE4Mi9jb250cm9sLnNoIiwidHlwZSI6InN5bWxpbmsiLCJ1aWQiOjB9LCJzb3VyY2VEaXJlY3RvcnkiOiIvdXNyL2xvY2FsL2xpYi9sZWV0cGx1cy1jb21wb3NlL2IwY2JmM2E0ZjMwMmIyOTk3NjJmYTA1NWYzYmZmZTAzNzZhOTExODIvX19weWNhY2hlX18iLCJzb3VyY2VNYWluU2hhIjoiN2I1M2U1YWRhOTU0NmZkNTUxNTY1NzAxY2M5OTViMGRhMzk2ODM3MiIsInNvdXJjZVBhcmVudCI6eyJjdGltZU5zIjoiMTc5MDM1MjMxNTM2NTIzOTMxOSIsImRldmljZSI6NjQ1MTIsImdpZCI6MCwiaW5vZGUiOjUzNzc1NzMsIm1vZGUiOjQ0OCwibXRpbWVOcyI6IjE3OTAzNTIzMTUzNjUyMzkzMTkiLCJubGluayI6MywicGF0aCI6Ii91c3IvbG9jYWwvbGliL2xlZXRwbHVzLWNvbXBvc2UvYjBjYmYzYTRmMzAyYjI5OTc2MmZhMDU1ZjNiZmZlMDM3NmE5MTE4MiIsInNpemUiOjQwOTYsInN0YXRlIjoiUFJFU0VOVCIsInR5cGUiOiJkaXJlY3RvcnkiLCJ1aWQiOjB9LCJzdGFnZWRCcmlkZ2VJbnN0YWxsIjp7ImRpcmVjdG9yeUlkZW50aXR5Ijp7ImN0aW1lTnMiOiIxNzkwMzUyMDQwNTM3MDk5NDgxIiwiZGV2aWNlIjo2NDUxMiwiZ2lkIjowLCJpbm9kZSI6NTM3NzY4NiwibW9kZSI6NDQ4LCJtdGltZU5zIjoiMTc5MDM1MjA0MDUzNzA5OTQ4MSIsIm5saW5rIjoyLCJwYXRoIjoiL3Vzci9sb2NhbC9saWIvbGVldHBsdXMtY29tcG9zZS9iZWJlYjQxMzU0ZGEwZGQwNGIyMTg0OTVjYmJmNWQ3NWJhOWYwYTg1Iiwic2l6ZSI6NDA5Niwic3RhdGUiOiJQUkVTRU5UIiwidHlwZSI6ImRpcmVjdG9yeSIsInVpZCI6MH0sImZpbGVDb3VudCI6MTAxLCJmdWxsRmlsZU1hcFNoYTI1NiI6ImZjYjIwOWMwZGQ0YjIyYTI2YTE3YjlhYzY0MjUwODJjYjc5ZTJjM2U0MWZkNGFhMmQ2YzY1NGQ3NzkwYTdiZDciLCJtYW5pZmVzdFNoYTI1NiI6IjM5YTQ5NDFkZmNjYzdiNjY5NWQ0ZDViMDkyM2NjYWY5MzM0OTBiY2NiNmExMGU0MDE2OGUwNDM1Nzc3MzhkNDgifX0K'

def require(ok, reason):
    if not ok: raise RuntimeError(reason)

def sha(data): return hashlib.sha256(data).hexdigest()
def canonical(value): return (json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False)+'\n').encode()

def identity(path):
    try:st=path.lstat()
    except FileNotFoundError:return {'state':'ABSENT'}
    kind='directory' if stat.S_ISDIR(st.st_mode) else 'regular' if stat.S_ISREG(st.st_mode) else 'symlink' if stat.S_ISLNK(st.st_mode) else 'other'
    return {'state':'PRESENT','type':kind,'path':str(path),'device':st.st_dev,'inode':st.st_ino,'ctimeNs':str(st.st_ctime_ns),'mtimeNs':str(st.st_mtime_ns),'uid':st.st_uid,'gid':st.st_gid,'mode':stat.S_IMODE(st.st_mode),'nlink':st.st_nlink,'size':st.st_size}

def read(path,maximum):
    before=path.lstat();require(stat.S_ISREG(before.st_mode) and before.st_size<=maximum and before.st_uid==before.st_gid==0 and before.st_nlink==1,'record metadata')
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC)
    try:
        opened=os.fstat(fd);require((opened.st_dev,opened.st_ino,opened.st_ctime_ns)==(before.st_dev,before.st_ino,before.st_ctime_ns),'record open race')
        parts=[];size=0
        while size<=maximum:
            part=os.read(fd,min(65536,maximum+1-size))
            if not part:break
            parts.append(part);size+=len(part)
        raw=b''.join(parts);after=os.fstat(fd)
        require(len(raw)==before.st_size and (after.st_dev,after.st_ino,after.st_ctime_ns)==(before.st_dev,before.st_ino,before.st_ctime_ns),'record read race')
        return raw
    finally:os.close(fd)

def cache_exact(path,plan):
    state=identity(path)
    if state['state']=='ABSENT':return {'state':'ABSENT'}
    original=plan['cacheDirectory']
    require(state['type']=='directory' and (state['device'],state['inode'],state['uid'],state['gid'],state['mode'])==(original['device'],original['inode'],0,0,0o700),'cache dir identity')
    leaf=path/'backup_crypto.cpython-314.pyc'
    require(set(x.name for x in path.iterdir())=={leaf.name},'cache leaf closure')
    m=identity(leaf);target=plan['cacheLeaf']
    require(m['type']=='regular' and (m['device'],m['inode'],m['uid'],m['gid'],m['mode'],m['nlink'],m['size'])==(target['device'],target['inode'],0,0,0o600,1,target['size']) and sha(read(leaf,1048576))==target['sha256'],'cache leaf bytes')
    return {'state':'EXACT','directory':state,'leaf':{**m,'sha256':target['sha256']}}

def install_map(root,plan,extra):
    manifest_raw=read(root/'install-manifest.json',65536)
    require(sha(manifest_raw)==plan['manifestSha256'],'installed manifest digest')
    manifest=json.loads(manifest_raw)
    require(manifest['releaseSha']==root.name and len(manifest['files'])==plan['fileCount'],'installed manifest identity')
    require({p.name for p in root.iterdir()}==set(manifest['files'])|{'install-manifest.json'}|extra,'installed root closed set')
    observed={}
    for name,digest in manifest['files'].items():
        require(re.fullmatch(r'[A-Za-z0-9_.@-]+',name) and sha(read(root/name,2*1024*1024))==digest,'installed leaf digest')
        observed[name]=digest
    require(sha(canonical(observed))==plan['fullFileMapSha256'],'installed full map digest')

def main():
    require(os.geteuid()==0 and sys.flags.isolated==1 and sys.flags.optimize==0 and sys.dont_write_bytecode,'read-only interpreter')
    signal.alarm(45)
    raw=base64.b64decode(PLAN_B64,validate=True);plan=json.loads(raw);plan_sha=sha(raw)
    require(raw==canonical(plan) and len(sys.argv)==3 and sys.argv[1]=='--reconcile' and sys.argv[2]==plan_sha,'exact plan invocation')
    require(sha(pathlib.Path('/etc/machine-id').read_bytes().strip())==plan['hostIdentitySha256'] and pathlib.Path('/proc/sys/kernel/random/boot_id').read_text().strip()==plan['bootId'],'host/boot drift')
    src=pathlib.Path(plan['sourceDirectory']);dest=pathlib.Path(plan['quarantineDirectory']);intent=pathlib.Path(plan['intentPath']);receipt=pathlib.Path(plan['receiptPath'])
    lock=identity(pathlib.Path('/var/lib/leetplus-compose/control.lock'))
    require(lock['type']=='regular' and (lock['device'],lock['inode'],lock['ctimeNs'],lock['uid'],lock['gid'],lock['mode'])==(plan['nativeControlLock']['device'],plan['nativeControlLock']['inode'],plan['nativeControlLock']['ctimeNs'],0,0,0o600),'native lock drift')
    key='%02x:%02x:%d'%(os.major(lock['device']),os.minor(lock['device']),lock['inode'])
    fd=os.open('/var/lib/leetplus-compose/control.lock',os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    opened=os.fstat(fd)
    require((opened.st_dev,opened.st_ino,opened.st_ctime_ns)==(lock['device'],lock['inode'],int(lock['ctimeNs'])),'native lock open race')
    limit=time.monotonic()+2
    while True:
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);break
        except BlockingIOError:
            if time.monotonic()>=limit:
                os.close(fd)
                print(json.dumps({'decision':'UNKNOWN_NATIVE_LOCK_BUSY','operationId':plan['operationId'],'serverWrites':False}));return
            time.sleep(0.02)
    visible=identity(pathlib.Path('/var/lib/leetplus-compose/control.lock'))
    require((visible['device'],visible['inode'],visible['ctimeNs'])==(lock['device'],lock['inode'],lock['ctimeNs']),'native lock changed after acquisition')
    holders=[]
    for line in pathlib.Path('/proc/locks').read_text().splitlines():
        fields=line.split()
        if len(fields)>=8 and fields[5]==key:holders.append({'kind':fields[1],'mode':fields[3],'pid':fields[4],'deviceInode':fields[5]})
    if any(x['mode']=='WRITE' and x['pid']!=str(os.getpid()) for x in holders):
        print(json.dumps({'decision':'UNKNOWN_WRITER_ACTIVE','operationId':plan['operationId'],'lockHolders':holders,'serverWrites':False}));return
    first={str(x):identity(x) for x in (src,dest,intent,receipt)}
    source=cache_exact(src,plan)
    quarantine=cache_exact(dest,plan)
    intent_raw=read(intent,131072) if first[str(intent)]['state']=='PRESENT' else None
    receipt_raw=read(receipt,131072) if first[str(receipt)]['state']=='PRESENT' else None
    i=json.loads(intent_raw) if intent_raw else None
    r=json.loads(receipt_raw) if receipt_raw else None
    if i:
        require(set(i)=={'contract','operationId','planSha256','directGoReceiptSha256','signedApproval','signedApprovalSha256','sourceDirectory','quarantineDirectory','sourceDirectoryPreimage','cacheLeafSha256','issuedAt'},'intent closed keys')
        require(i.get('contract')=='LEETPLUS_B0_CACHE_QUARANTINE_INTENT_V1' and i.get('operationId')==plan['operationId'] and i.get('planSha256')==plan_sha and i.get('sourceDirectory')==str(src) and i.get('quarantineDirectory')==str(dest) and i.get('cacheLeafSha256')==plan['cacheLeaf']['sha256'] and re.fullmatch(r'[0-9a-f]{64}',i.get('directGoReceiptSha256','')),'intent identity')
        require(intent_raw==canonical(i),'intent canonical')
        signed=i['signedApproval'];require(set(signed)=={'approval','signatureBase64'} and sha(canonical(signed))==i['signedApprovalSha256'],'retained signed approval digest')
        a=signed['approval'];require(a['operationId']==plan['operationId'] and a['planSha256']==plan_sha and a['directUserGoReceiptSha256']==i['directGoReceiptSha256'] and a['baselineSummarySha256']==plan['baselineSummarySha256'],'retained approval links')
        require(dt.datetime.fromisoformat(a['authorizedAt'].replace('Z','+00:00'))<=dt.datetime.fromisoformat(i['issuedAt'].replace('Z','+00:00'))<dt.datetime.fromisoformat(a['expiresAt'].replace('Z','+00:00')),'intent authorization time')
        require(set(a)=={'contract','operationId','planSha256','executorSha256','baselineSummarySha256','hostIdentitySha256','bootId','effectOwnerThreadId','directUserGoReceiptSha256','authorizedAt','expiresAt'} and a['contract']=='LEETPLUS_B0_CACHE_QUARANTINE_APPROVAL_V1' and a['executorSha256']=='03f05a24efb9205c9ffc3d6afd929ed33b2bacd8d43d588ea6f7c03ee69cc020' and a['hostIdentitySha256']==plan['hostIdentitySha256'] and a['bootId']==plan['bootId'] and a['effectOwnerThreadId']==plan['effectOwnerThreadId'],'closed approval identity')
        root_path=pathlib.Path('/etc/leetplus-compose/approval-root.pem');root_raw=read(root_path,4096)
        require(sha(root_raw)==plan['publicRootSha256'] and 'PRIVATE' not in root_raw.decode(),'public root')
        node_path=pathlib.Path('/usr/bin/node').resolve(strict=True)
        require(str(node_path)==plan['nodeInterpreter']['realpath'] and sha(read(node_path,128*1024*1024))==plan['nodeInterpreter']['sha256'],'reconcile Node interpreter')
        node_fd=os.open(node_path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
        try:
            node_before=os.fstat(node_fd)
            require(stat.S_ISREG(node_before.st_mode) and node_before.st_uid==node_before.st_gid==0 and not node_before.st_mode&0o022 and node_before.st_size<=128*1024*1024,'held Node metadata')
            node_chunks=[];node_size=0
            while node_size<=128*1024*1024:
                part=os.read(node_fd,1048576)
                if not part:break
                node_chunks.append(part);node_size+=len(part)
            require(node_size==node_before.st_size and sha(b''.join(node_chunks))==plan['nodeInterpreter']['sha256'],'held Node hash')
            node_after=os.fstat(node_fd);require((node_before.st_dev,node_before.st_ino,node_before.st_ctime_ns,node_before.st_mtime_ns,node_before.st_size)==(node_after.st_dev,node_after.st_ino,node_after.st_ctime_ns,node_after.st_mtime_ns,node_after.st_size),'held Node changed')
            verified=subprocess.run(['/proc/self/fd/'+str(node_fd),'--input-type=module','-e',"import crypto from 'node:crypto';import fs from 'node:fs';const v=JSON.parse(fs.readFileSync(0,'utf8'));const k=crypto.createPublicKey(v.publicKey);if(k.asymmetricKeyType!=='ed25519'||!crypto.verify(null,Buffer.from(v.message,'base64'),k,Buffer.from(v.signature,'base64')))process.exit(1);process.stdout.write('PASS');"],input=json.dumps({'publicKey':root_raw.decode(),'message':base64.b64encode(canonical(a)).decode(),'signature':signed['signatureBase64']}).encode(),capture_output=True,timeout=15,pass_fds=(node_fd,),env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LANG':'C.UTF-8','LC_ALL':'C.UTF-8','TZ':'UTC'})
        finally:os.close(node_fd)
        require(verified.returncode==0 and verified.stdout==b'PASS' and not verified.stderr,'historical Ed25519 approval signature')
    if r:
        require(set(r)=={'contract','decision','operationId','planSha256','directGoReceiptSha256','signedApprovalSha256','intentSha256','sourceDirectoryAbsent','quarantineDirectory','quarantineLeaf','acceptedInstallManifestSha256','activeRecordSha256','handoffPointerSha256','completedAt'},'receipt closed keys')
        require(i is not None and r.get('contract')=='LEETPLUS_B0_CACHE_QUARANTINE_RECEIPT_V1' and r.get('decision')=='EXACT_CACHE_QUARANTINED_NO_DELETION' and r.get('operationId')==plan['operationId'] and r.get('planSha256')==plan_sha and r.get('directGoReceiptSha256')==i['directGoReceiptSha256'] and r.get('intentSha256')==sha(intent_raw) and r.get('quarantineLeaf',{}).get('sha256')==plan['cacheLeaf']['sha256'],'receipt identity')
        require(receipt_raw==canonical(r),'receipt canonical')
        require(r['signedApprovalSha256']==i['signedApprovalSha256'] and r['sourceDirectoryAbsent'] is True and r['acceptedInstallManifestSha256']==plan['acceptedInstall']['manifestSha256'] and r['activeRecordSha256']==plan['activeRecordSha256'] and r['handoffPointerSha256']==plan['handoffPointerSha256'],'receipt full identity')
        require(quarantine['state']=='EXACT' and r['quarantineDirectory']['device']==quarantine['directory']['device'] and r['quarantineDirectory']['inode']==quarantine['directory']['inode'] and r['quarantineDirectory']['ctimeNs']==quarantine['directory']['ctimeNs'] and r['quarantineLeaf']==quarantine['leaf'],'receipt exact quarantine postimage')
        require(dt.datetime.fromisoformat(i['issuedAt'].replace('Z','+00:00'))<=dt.datetime.fromisoformat(r['completedAt'].replace('Z','+00:00'))<dt.datetime.fromisoformat(i['signedApproval']['approval']['expiresAt'].replace('Z','+00:00')),'receipt authorization time')
    after={str(x):identity(x) for x in (src,dest,intent,receipt)}
    require(all(first[name]==after[name] for name in first),'state changed during reconcile')
    install_map(src.parent,plan['acceptedInstall'],{'__pycache__'} if source['state']=='EXACT' else set())
    install_map(pathlib.Path('/usr/local/lib/leetplus-compose/bebeb41354da0dd04b218495cbbf5d75ba9f0a85'),plan['stagedBridgeInstall'],set())
    require(os.readlink('/usr/local/sbin/leetplus-compose')==plan['servingPointer']['target'] and sha(read(pathlib.Path('/var/lib/leetplus-compose/active.json'),65536))==plan['activeRecordSha256'] and sha(read(pathlib.Path('/var/lib/leetplus-compose/control-handoffs/active.json'),65536))==plan['handoffPointerSha256'] and identity(pathlib.Path('/var/lib/leetplus-compose/control-handoff.pending.json'))['state']=='ABSENT','controller records changed')
    if not i and not r and source['state']=='EXACT' and quarantine['state']=='ABSENT':decision='NOT_STARTED_EXACT_PREIMAGE'
    elif i and not r and source['state']=='EXACT' and quarantine['state']=='ABSENT':decision='INTENT_ONLY_NO_MOVE_NO_REPLAY'
    elif i and not r and source['state']=='ABSENT' and quarantine['state']=='EXACT':decision='MOVED_NO_TERMINAL_NO_REPLAY'
    elif i and r and source['state']=='ABSENT' and quarantine['state']=='EXACT':decision='TERMINAL_EXACT_QUARANTINED'
    else:decision='CONTRADICTORY_OR_RECREATED_HOLD'
    print(json.dumps({'at':dt.datetime.now(dt.timezone.utc).isoformat(),'decision':decision,'operationId':plan['operationId'],'planSha256':plan_sha,'source':source,'quarantine':quarantine,'intentSha256':sha(intent_raw) if intent_raw else None,'receiptSha256':sha(receipt_raw) if receipt_raw else None,'lockHolders':holders,'exclusiveObservationLockHeld':True,'serverWrites':False,'effectReplayAuthorized':False},sort_keys=True))
    os.close(fd)

if __name__=='__main__':main()
