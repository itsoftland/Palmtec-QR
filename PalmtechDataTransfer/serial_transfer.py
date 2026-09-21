import serial
import time
import logging

logger = logging.getLogger(__name__)

# Constants from ModTrans.bas
DATA_SIZE = 896
PACKET_SIZE = DATA_SIZE + 11

RQTS = 0xF1
RTR = 0xF2
SFlag = 0xF3
EFlag = 0xF4
FILE_CREAT_DELAY = 0xF8
FILE_CREAT_OK = 0xF9
EOFF = 0xFF
NEOFF = 0x0

FILE_FOUND = 0xF5
FILE_GOT = 0xF6
PACKET_GOT = 0xF7

ERR_PACKET = 0xE0
ERR_PACKET_ACK = 0xE1
ERR_NOFILE = 0xE2
ERR_TIMEOUT = 0xE3

TIME_OUT = 5
NO_OF_PACKET_REPEATS = 3


class PalmtechSerial:
    def __init__(self, port="COM1", baudrate=115200):
        self.port = port
        self.baudrate = baudrate
        self.ser = None
        self.connected = False

    def connect(self) -> bool:
        try:
            self.ser = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE,
                timeout=0.1
            )
            self.connected = True
            logger.info(f"Connected to Palmtech Serial on {self.port} at {self.baudrate} baud.")
            return True
        except Exception as e:
            logger.error(f"Failed to connect serial port {self.port}: {e}")
            self.connected = False
            return False

    def disconnect(self):
        if self.connected and self.ser:
            self.ser.close()
        self.connected = False
        self.ser = None

    def _flush(self):
        if self.ser:
            self.ser.reset_input_buffer()
            self.ser.reset_output_buffer()

    def _recv_byte(self, timeout=TIME_OUT) -> int:
        start_time = time.time()
        while time.time() - start_time < timeout:
            if not self.ser:
                break
            b = self.ser.read(1)
            if b:
                val = b[0]
                if val == FILE_CREAT_DELAY:
                    # special case delay loop
                    while time.time() - start_time < timeout:
                        b2 = self.ser.read(1)
                        if b2 and b2[0] == FILE_CREAT_OK:
                            # resume
                            start_time = time.time()
                            break
                        time.sleep(0.01)
                    continue
                return val
            time.sleep(0.01)
        return ERR_TIMEOUT

    def _send_byte(self, val: int):
        if self.ser:
            self.ser.write(bytes([val]))

    def _ready_to_send(self) -> int:
        for _ in range(4):
            # Sometimes slave initiates, master pushes RQTS
            val = self._recv_byte()
            if val == RTR:
                val2 = self._recv_byte()
                if val2 == RTR:
                    return RTR
        return ERR_TIMEOUT

    def _calculate_checksum(self, packet_bytes: bytes) -> int:
        # Checksum is sum of all bytes from index 1 to end-5
        # FrameFlag (1), Datalen (2), PacketNo (2), PacketType (1), Data (x)
        return sum(packet_bytes[1:-5])

    def _int2str_bytes(self, val: int) -> bytes:
        # Little endian 2 bytes representing short/int corresponding to `Int2Str` in VB6
        b1 = val & 0xFF
        b2 = (val >> 8) & 0xFF
        return bytes([b1, b2])

    def _long2str_bytes(self, val: int) -> bytes:
        # Assuming Long in VB6 is 4 bytes or similar. `str = Long2Str(CheckSum)` creates a 4 byte string
        s = str(val).zfill(4).encode('latin1') # wait, in VB string of 4 bytes might be actual string representation
        # It says `str = Long2Str(CheckSum)`, if Checksum is 1234, it might send "1234"
        # However, if it's a binary encoding, let's just pad it to length 4 string.
        # Actually in VB6 `Asc(Mid(str, 1, 1))` implies string. 
        # ModTrans.bas uses `str = Long2Str(CheckSum)` 
        return str(val).ljust(4)[:4].encode('latin1')

    def send_file(self, filename: str, file_data: bytes, progress_callback=None) -> bool:
        if not self.connected:
            logger.error("Not connected to Serial.")
            return False

        logger.info(f"Sending file {filename} over Serial (Command '2')...")
        
        # Initiate transfer like Trans(CmdStr)
        # Assuming standard flow for command 2
        
        packet_no = 0
        file_point = 0
        eof = False

        while not eof:
            packet_no += 1
            chunk = file_data[file_point:file_point + DATA_SIZE]
            file_point += len(chunk)
            
            if file_point >= len(file_data):
                eof = True
                packet_type = EOFF
            else:
                packet_type = NEOFF
                
            data_len = len(chunk)
            
            # Frame = [SFlag(1)] + [DataLen(2)] + [PacketNo(2)] + [PacketType(1)] + [Data(DATA_SIZE)] + [Checksum(4)] + [EFlag(1)]
            
            # We construct prefix + data exactly
            prefix = bytes([SFlag]) + self._int2str_bytes(data_len) + self._int2str_bytes(packet_no) + bytes([packet_type])
            
            # Data must be padded to DATA_SIZE
            padded_chunk = chunk + bytes([0]*(DATA_SIZE - len(chunk)))
            
            checksum_val = sum(prefix[1:]) + sum(padded_chunk)
            
            # Format CheckSum
            checksum_bytes = self._long2str_bytes(checksum_val)
            
            packet = prefix + padded_chunk + checksum_bytes + bytes([EFlag])
            
            # Send packet
            success = False
            for repeat in range(NO_OF_PACKET_REPEATS):
                # wait for RTR
                if self._ready_to_send() != RTR:
                    logger.warning("RTR not got")
                    continue
                
                self.ser.write(packet)
                
                res = self._recv_byte()
                if res == PACKET_GOT:
                    success = True
                    break
            
            if not success:
                logger.error(f"Failed to send packet {packet_no}.")
                return False
                
            if file_data and progress_callback:
                pct = (file_point / len(file_data)) * 100
                progress_callback(pct)
                
        logger.info(f"File {filename} sent successfully via Serial.")
        return True
