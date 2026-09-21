import hid
import time
import typing
import logging
import datetime

logger = logging.getLogger(__name__)

VENDOR_ID = 0xC251
PRODUCT_ID = 0x1701
PALMTEC_NAME = "PALMTEC"

class PalmtechUSB:
    def __init__(self, vendor_id=None, product_id=None):
        self.vendor_id = vendor_id
        self.product_id = product_id
        self.device = None
        self.connected = False
        self.handshake_ok = False  # Track handshake state separately

    def auto_detect(self) -> bool:
        """Find the Palmtech device."""
        found = False
        for d in hid.enumerate():
            vid = d.get('vendor_id')
            pid = d.get('product_id')
            path = d.get('path')
            if vid == VENDOR_ID and pid == PRODUCT_ID:
                logger.info(f"Found potential Palmtech device: {vid:04x}:{pid:04x} at {path}")
                logger.info(f"  Product: {d.get('product_string')}, Interface: {d.get('interface_number')}")
                if not found:
                    self.vendor_id = vid
                    self.product_id = pid
                    found = True
        
        if found:
            return True
        
        # Fallback to defaults if nothing found
        if self.vendor_id is None:
            self.vendor_id = VENDOR_ID
            self.product_id = PRODUCT_ID
        return False

    def connect(self) -> bool:
        if not self.vendor_id:
            if not self.auto_detect():
                logger.error("Could not auto-detect palmtech device.")
                return False
        
        try:
            self.device = hid.device()
            self.device.open(self.vendor_id, self.product_id)
            # Use BLOCKING mode with timeout instead of non-blocking
            # Non-blocking floods with 64-byte zero packets and hides real responses
            self.device.set_nonblocking(0)
            self.connected = True
            logger.info("Connected to Palmtech USB (blocking mode).")
            
            # Handshake: Send trigger sequence (VB6 sends exactly 27 't's)
            logger.info("🔌 Initiating Handshake (Triggering Transfer Mode)...")
            
            # 1. Clear any junk from buffer (short timeout)
            self._flush_read(timeout_ms=500)
            
            # 2. Send 't' sequence
            logger.info("  -> Sending trigger sequence (27 t's)...")
            self._write_raw("ttttttttttttttttttttttttttt")
            
            # 3. Wait for device to switch modes
            time.sleep(1.5)
            
            # 4. Flush any response from trigger
            self._flush_read(timeout_ms=500)
            
            return True
        except Exception as e:
            logger.error(f"Failed to connect to USB: {e}")
            self.connected = False
            return False

    def disconnect(self):
        if self.connected and self.device:
            logger.info("🔌 Initiating two-step Shutdown sequence...")
            try:
                # Step 1: Send VB6 "SHUTDOWN" command string ("s@")
                logger.info("  -> Sending s@ signal...")
                self._write_raw("s@")
                time.sleep(1.0)
                
                # Step 2: Send VB6 "EXIT TRIGGER"
                logger.info("  -> Sending Exit Trigger (xxxxxxxxxxxxx)...")
                self._write_raw("xxxxxxxxxxxxx")
                time.sleep(1.0)
            except Exception as e:
                logger.warning(f"  (Shutdown sequence failed: {e})")
                
            try:
                self.device.close()
            except:
                pass
        self.connected = False
        self.device = None

    def _write_raw(self, data: typing.Union[str, bytes]):
        """Write 65 bytes to HID device (1 byte report ID + 64 bytes data).
        
        Emulates VB6 truncation bug: the last byte of the input data is dropped.
        This is intentional — add a trailing space or '#' to protect meaningful data.
        """
        buf = [0x00] * 65  # Report ID (0x00) + 64 data bytes
        
        if isinstance(data, str):
            data_bytes = data.encode('latin1')
        else:
            data_bytes = bytes(data)
            
        # VB6 Truncation Bug Emulation: last byte is dropped
        # For i in 0..63: if (i+1) < len(data) then buf[i] = data[i] else buf[i] = 0
        for i in range(64):
            if (i + 1) < len(data_bytes):
                buf[i + 1] = data_bytes[i]
            else:
                buf[i + 1] = 0
                
        if self.device:
            try:
                self.device.write(buf)
                # Removed hardcoded 20ms delay here; send_file manages its own 2ms throttle.
            except Exception as e:
                logger.error(f"USB Write Error: {e}")

    def _flush_read(self, timeout_ms=500):
        """Read and discard any pending data from device."""
        if not self.device:
            return
        # Temporarily set a short timeout to drain the buffer
        old_blocking = True
        try:
            self.device.set_nonblocking(1)
            deadline = time.time() + (timeout_ms / 1000.0)
            while time.time() < deadline:
                try:
                    data = self.device.read(64)
                    if not data:
                        break
                except:
                    break
                time.sleep(0.01)
        finally:
            self.device.set_nonblocking(0)

    def _read_data(self, expected_char=None, timeout=5.0) -> str:
        """Read data from device using blocking mode with timeout.
        
        In blocking mode, device.read() with a timeout will wait for actual data
        instead of returning 64 zero-bytes immediately (non-blocking flood bug).
        """
        start_time = time.time()
        buf = ""
        while time.time() - start_time < timeout:
            if not self.device:
                break
            
            try:
                # Use blocking read with 200ms timeout
                # This returns [] if no data within timeout (not 64 zeros)
                data = self.device.read(64, timeout_ms=200)
            except Exception as e:
                logger.error(f"USB Read Exception: {e}")
                break

            if data:
                # Filter out all-zero packets (device idle noise)
                has_nonzero = any(b != 0 for b in data)
                if has_nonzero:
                    new_str = "".join([chr(c) for c in data if c != 0])
                    if new_str:
                        logger.info(f"USB received: {repr(new_str)} (hex: {' '.join(f'{c:02x}' for c in data[:16])}...)")
                        buf += new_str
            
            if expected_char and expected_char in buf:
                return buf
            elif not expected_char and buf:
                return buf
            
        if buf and expected_char and expected_char not in buf:
            logger.warning(f"Timeout reached. Buffer contents: {repr(buf)}")
        return buf

    def _read_version(self) -> bool:
        """Try to read VERSION.DAT from device and validate it."""
        logger.info("Reading VERSION.DAT from device...")
        
        for p in ['a', 'r', 'g']:
            data = self.read_file("VERSION.DAT", prefix=p)
            
            if data:
                version_str = data[:16].decode('latin1', errors='ignore').replace('\x00', '').strip()
                logger.info(f"  📥 Version data (prefix {p}): \"{version_str}\"")
                
                r_pos = version_str.rfind('R')
                if r_pos != -1:
                    prefix = version_str[:r_pos]
                    if prefix == "PVT_GEN_12":
                        logger.info("  ✅ Version match (PVT_GEN_12).")
                        return True
                        
                logger.error(f"  ❌ Version mismatch. Expected prefix 'PVT_GEN_12' before 'R', got: '{version_str}'")
        
        logger.warning("Failed to read a valid VERSION.DAT with any prefix.")
        return False

    def _sync_datetime(self):
        """Sync date/time to device. Matches Web/APK format: D@DDMMYYYYHHMMSS\\x00"""
        now = datetime.datetime.now()
        # Web/APK uses 4-digit year and null terminator
        dd = f"{now.day:02d}"
        mm = f"{now.month:02d}"
        yyyy = str(now.year)  # 4-digit year (e.g. "2026")
        hh = f"{now.hour:02d}"
        mi = f"{now.minute:02d}"
        ss = f"{now.second:02d}"
        
        # Wire Protocol: "D@" + "DDMMYYYYHHMMSS" + "\x00"
        # The \x00 at the end is the sacrificial byte (gets truncated)
        date_str = f"D@{dd}{mm}{yyyy}{hh}{mi}{ss}\x00"
        logger.info(f"Syncing Time: D@{dd}{mm}{yyyy}{hh}{mi}{ss}")
        self._write_raw(date_str)
        
        # Wait for 't' (start of "tSuccess") or any response
        resp = self._read_data(expected_char='t', timeout=5.0)
        if 't' in resp or 'uccess' in resp.lower():
            logger.info("✅ Time sync confirmed.")
        elif resp:
            logger.info(f"Time sync sent, device response: \"{resp.strip()}\"")
        else:
            logger.warning("Time sync sent but no response received. Continuing...")
        time.sleep(1.0)

    def handshake(self) -> bool:
        """Perform handshake sequence. Returns True if handshake succeeded."""
        logger.info("🚀 Starting Handshake Sequence...")
        
        # 1. Read VERSION.DAT and check compatibility
        version_ok = self._read_version()
        if not version_ok:
            logger.error("⚠️ Version read failed or mismatched. Aborting transfer.")
            return False
            
        # 2. Write 'v@' (version acknowledge)
        logger.info("  -> Sending v@ acknowledge (VERISON_SUCESS)...")
        self._write_raw('v@')
        time.sleep(1.0)
        logger.info("  ✅ v@ sent.")
        
        # 3. Set Date/Time
        logger.info("  -> Syncing Date/Time...")
        self._sync_datetime()
        logger.info("  ✅ Date/Time sync complete.")
        time.sleep(1.5)
        
        self.handshake_ok = True
        return True

    def send_file(self, filename: str, file_data: bytes, progress_callback=None) -> bool:
        """Send a single file to the device.
        
        Protocol: 
        1. Send header: b<FILENAME>#<SIZE># (trailing space for truncation)
        2. Wait for 'k' ack from device
        3. Send data in 63-byte chunks, each framed as d<data>V
        4. Every 260 chunks, wait for intermediate 'k' ack
        """
        if not self.connected:
            logger.error("Not connected to USB.")
            return False

        logger.info(f"📤 Sending file {filename} ({len(file_data)} bytes)...")
        fsize = len(file_data)
        
        if fsize == 0:
            logger.warning(f"  File {filename} is empty, skipping.")
            return True
        
        # Flush existing data before starting
        self._flush_read(timeout_ms=300)
        
        # Format: b<FILENAME>#<SIZE># (the final # will be dropped by truncation, matching VB6 exactly)
        header = f"b{filename.upper()}#{fsize}#"
        logger.info(f"  -> Header: b{filename.upper()}#{fsize}#")
        self._write_raw(header)
        
        # Step 2: Wait for 'k' ack (device confirms it's ready to receive)
        logger.info("  ⏳ Waiting for device 'k' ack...")
        resp = self._read_data(expected_char='k', timeout=15.0)
        if 'k' not in resp and 'K' not in resp:
            logger.error(f"  ❌ Device did not ack header for {filename}. Response: \"{resp}\"")
            logger.error(f"     (Waited 15s for 'k' — device may not be in transfer mode)")
            return False
            
        logger.info("  ✅ Ack received. Sending data chunks...")
        
        # Step 3: Send data in 63-byte chunks framed as d<data>V
        chunk_size = 63
        chunks = [file_data[i:i+chunk_size] for i in range(0, fsize, chunk_size)]
        total_chunks = len(chunks)
        
        for i, chunk in enumerate(chunks, 1):
            # Frame: 'd' + chunk_data + 'V'
            packet = b'd' + chunk + b'V'
            self._write_raw(packet)
            
            # Throttle: 2ms between packets (reduced from 20ms to prevent device timeouts on large table-type files)
            time.sleep(0.002)
            
            if i % 10 == 0 or i == total_chunks:
                pct = (i / total_chunks) * 100
                logger.info(f"  Chunk {i}/{total_chunks} ({pct:.0f}%)")
                if progress_callback:
                    progress_callback(pct)
            
            # Every 260 packets: wait for intermediate sync 'k' ack
            if i % 260 == 0 and i < total_chunks:
                logger.info(f"  ⏳ Sync point at chunk {i}: waiting for 'k' ack...")
                resp = self._read_data(expected_char='k', timeout=10.0)
                if 'k' not in resp and 'K' not in resp:
                    logger.error(f"  ❌ Sync failure at chunk {i}. Response: \"{resp}\"")
                    return False
                logger.info(f"  ✅ Sync confirmed at chunk {i}.")
                    
        logger.info(f"  ✅ File {filename} sent successfully! ({total_chunks} chunks)")
        return True

    def end_transfer(self):
        """Send UPLOADSUCCESS signal to device."""
        logger.info("📤 Sending UPLOADSUCCESS (o@)...")
        self._write_raw('o@')
        time.sleep(1.0)
        logger.info("✅ Upload complete signal sent.")

    # ── Upload (Read from Device) Methods ──────────────────────────────

    def _read_raw_bytes(self, timeout=5.0) -> typing.Tuple[bytes, int]:
        """Read one raw 64-byte HID packet from device. Returns (raw_bytes, packet_num).
        
        VB6 Read_USB packet format (64 bytes):
          [0]    = 'd' (0x64) packet marker
          [1..4] = packet number (4-byte little-endian integer)
          [5..63]= data payload (59 bytes)
        """
        start = time.time()
        while time.time() - start < timeout:
            if not self.device:
                break
            try:
                data = self.device.read(64, timeout_ms=500)
            except Exception as e:
                logger.error(f"USB Read Exception: {e}")
                break
            if data and any(b != 0 for b in data):
                return bytes(data), 0
        return b'', -1

    def read_file(self, filename: str, prefix: str = 'a', progress_callback=None) -> typing.Optional[bytes]:
        """Read a file FROM the device (VB6 Read_USB protocol).
        
        Protocol:
        1. Send a<FILENAME># 
        2. Wait for s<FILESIZE>#
        3. Send 30 k's
        """
        if not self.connected:
            logger.error("Not connected to device.")
            return None

        logger.info(f"📥 Reading file {filename} from device...")
        self._flush_read(timeout_ms=300)
        time.sleep(1.0)

        # Step 1: Send read command
        cmd = f"{prefix}{filename}#"
        logger.info(f"  -> Sending read command: {cmd}")
        self._write_raw(cmd)

        # Step 2: Wait for s<SIZE># response
        logger.info("  ⏳ Waiting for file size header (s<SIZE>#)...")
        resp = self._read_data(expected_char='s', timeout=10.0)
        
        if 's' not in resp:
            logger.error(f"  ❌ No size header received for {filename}. Response: '{resp}'")
            return None

        # Parse file size from "s <SIZE>#" or "s<SIZE>#"
        try:
            s_idx = resp.index('s')
            hash_idx = resp.index('#', s_idx + 1)
            size_str = resp[s_idx + 1:hash_idx].strip()
            fsize = int(size_str)
        except (ValueError, IndexError):
            logger.error(f"  ❌ Could not parse file size from: '{resp}'")
            return None

        logger.info(f"  📏 File size: {fsize} bytes")

        if fsize == 0:
            logger.info(f"  ✅ File {filename} is empty (0 bytes).")
            return b''

        # Step 3: Send 30 k's acknowledgment
        logger.info("  -> Sending 30 k-acks...")
        self._write_raw(b'k' * 30)
        
        # Step 4: Read data packets
        # VB constants: DATA_SIZE=59, DATA_START=5 (0-indexed)
        data_size = 59
        data_start = 5  # 0-indexed position where data begins
        accumulated = bytearray()
        prev_pkt = 0
        timeout_val = max(15.0, fsize / 100.0)  # Scale timeout with file size

        logger.info(f"  ⏳ Reading data packets (timeout={timeout_val:.0f}s)...")
        start_time = time.time()
        
        while len(accumulated) < fsize:
            if time.time() - start_time > timeout_val:
                logger.error(f"  ❌ Timeout reading {filename}. Got {len(accumulated)}/{fsize} bytes.")
                return None

            try:
                raw = self.device.read(64, timeout_ms=500)
            except Exception as e:
                logger.error(f"  ❌ USB read error: {e}")
                return None

            if not raw or not any(b != 0 for b in raw):
                continue

            raw_bytes = bytes(raw)
            
            # Check for 'd' packet marker
            if raw_bytes[0] != ord('d'):
                continue

            # Parse packet number (4-byte little-endian at [1..4])
            pkt_num = int.from_bytes(raw_bytes[1:5], byteorder='little')
            
            # Skip duplicate packets
            if pkt_num == prev_pkt and pkt_num != 0:
                continue

            # Extract data
            remaining = fsize - len(accumulated)
            if remaining < data_size:
                # Last packet — only take what we need
                accumulated.extend(raw_bytes[data_start:data_start + remaining])
            else:
                accumulated.extend(raw_bytes[data_start:data_start + data_size])

            prev_pkt = pkt_num
            
            # ACK the packet
            # VB6 Read_USB sends 'k' to ack each packet
            self._write_raw(b'k')
            start_time = time.time()  # Reset timeout on each good packet

            # Progress
            if len(accumulated) % (data_size * 50) < data_size or len(accumulated) >= fsize:
                pct = (len(accumulated) / fsize) * 100
                logger.info(f"  {len(accumulated)}/{fsize} bytes ({pct:.0f}%)")
                if progress_callback:
                    progress_callback(pct)

        logger.info(f"  ✅ File {filename} read successfully! ({len(accumulated)} bytes)")
        return bytes(accumulated)

    def read_status(self) -> typing.Dict[str, bool]:
        """Read STATUS.DAT from device and parse trip/schedule closed flags.
        
        VB6 logic:
          byte 0, bit 1 (AND 2): if set -> trip is OPEN (not closed)
          byte 0, bit 0 (AND 1): if set -> schedule is OPEN (not closed)
        """
        status = {'trip_closed': False, 'schedule_closed': False, 'raw': None}
        
        data = self.read_file("STATUS.DAT")
        if data is None or len(data) == 0:
            logger.warning("Could not read STATUS.DAT from device.")
            return status

        status['raw'] = data
        byte0 = data[0]
        status['trip_closed'] = not bool(byte0 & 2)
        status['schedule_closed'] = not bool(byte0 & 1)
        
        logger.info(f"  STATUS.DAT byte0=0x{byte0:02X}: "
                     f"trip_closed={status['trip_closed']}, "
                     f"schedule_closed={status['schedule_closed']}")
        return status

    def delete_tickets(self):
        """Send DELETETKTS command to clear ticket data on device."""
        logger.info("🗑️ Sending DELETETKTS command...")
        self._write_raw("r@DELETETKTS")
        time.sleep(1.0)
        logger.info("✅ DELETETKTS sent.")

    def get_device_files(self) -> typing.List[str]:
        """Get list of files stored on the device using 'cccc' command.
        
        Returns a list of filenames found on the device.
        """
        if not self.connected:
            return []

        logger.info("🔍 Requesting device file list (cccc)...")
        self._flush_read()
        self._write_raw("cccccccccccc")
        
        # Read packets starting with 's'
        # Format: s[PacketNo:1][TotalPackets:1][Data...]
        # Data format: *FILENAME$SIZE#ORG_SIZE*
        raw_data = ""
        start_time = time.time()
        while time.time() - start_time < 5.0:
            resp = self._read_data(expected_char='s', timeout=1.0)
            if 's' in resp:
                # Extract data after 's' and packet headers (2 bytes)
                # In Python _read_data already returns a string, we need to be careful with byte offsets
                # But VB code uses Mid(Buf, 3), which is 1-based, so index 2.
                try:
                    s_idx = resp.index('s')
                    raw_data += resp[s_idx + 3:] # Skip 's', PacketNo, TotalPackets
                except:
                    pass
            if '&' in resp: # '&' marks the end of the listing
                break
        
        if not raw_data:
            return []

        # Parse filenames: *FILENAME$SIZE#ORG_SIZE*
        files = []
        parts = raw_data.split('*')
        for p in parts:
            if '$' in p:
                filename = p.split('$')[0].strip()
                if filename:
                    files.append(filename.upper())
        
        logger.info(f"📁 Files found on device: {files}")
        return files
