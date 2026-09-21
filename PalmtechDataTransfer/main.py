import os
import sys
import logging
import traceback
import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox
import threading
import argparse
import re

def get_app_dir():
    """Return the directory where the exe (or script) lives.
    When built with PyInstaller --onefile the exe unpacks to a temp dir,
    but sys.executable still points to the real .exe on disk.
    """
    if getattr(sys, 'frozen', False):
        # Running as a PyInstaller bundle
        return os.path.dirname(sys.executable)
    else:
        # Running as a normal Python script
        return os.path.dirname(os.path.abspath(__file__))


# ── Set up logging FIRST, before anything else ─────────────────────
APP_DIR = get_app_dir()
LOG_FILE = os.path.join(APP_DIR, 'transfer_log.txt')

# Create a file handler that flushes immediately (no buffering)
file_handler = logging.FileHandler(LOG_FILE, mode='a', encoding='utf-8')
file_handler.setLevel(logging.DEBUG)
file_handler.setFormatter(
    logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
)

# Configure root logger so ALL loggers write to the file
root_logger = logging.getLogger()
root_logger.setLevel(logging.DEBUG)
root_logger.addHandler(file_handler)

logger = logging.getLogger(__name__)
logger.info("=" * 50)
logger.info(f"Application starting. APP_DIR = {APP_DIR}")


def flush_logs():
    """Force all log handlers to flush to disk."""
    for handler in root_logger.handlers:
        try:
            handler.flush()
        except Exception:
            pass


# ── Top-level imports for PyInstaller ───────────────────────────────
try:
    import usb_transfer
    import serial_transfer
except Exception:
    pass


def run_transfer_logic(args, status_callback, progress_callback=None, ui_callbacks=None):
    """The main background thread for the transfer process."""
    action = args.action
    folder = args.folder

    def get_clean_name(filename):
        return re.sub(r'\s*\(\d+\)', '', filename)

    mode_file = os.path.join(folder, "mode.txt")
    if action == "auto" and os.path.exists(mode_file):
        try:
            with open(mode_file, 'r') as f:
                content = f.read().strip().lower()
                if "upload" in content:
                    action = "upload"
                elif "download" in content:
                    action = "download"
            logger.info(f"Auto-detected mode from mode.txt: {action}")
        except Exception as e:
            logger.warning(f"Could not read mode.txt: {e}")

    if action == "auto":
        critical_download_files = {"BUS.DAT", "ROUTELST.LST", "STAGE.LST", "RTE.DAT"}
        if os.path.exists(folder):
            existing_files = {get_clean_name(f).upper() for f in os.listdir(folder) if os.path.isfile(os.path.join(folder, f))}
        else:
            existing_files = set()
            
        if existing_files.intersection(critical_download_files):
            action = "download"
            logger.info("Auto-detected mode: DOWNLOAD (found files to send)")
        else:
            action = "upload"
            logger.info("Auto-detected mode: UPLOAD (no files to send, checking device)")

    default_machine_bin = os.path.join(APP_DIR, "files", "machine bin")
    if action == "download" and args.machine_write:
        folder = default_machine_bin
        logger.info("Machine-write mode: sending .bin firmware files.")

    logger.info(f"Starting Palmtech worker in {args.mode} mode | Action: {action.upper()}")
    logger.info(f"Application directory : {APP_DIR}")
    logger.info(f"Target folder         : {folder}")

    if not os.path.isdir(folder):
        logger.error(f"Provided path is not a valid directory: {folder}")
        status_callback("Error: Invalid Directory")
        return

    # Initialize connection
    if args.mode == "USB":
        from usb_transfer import PalmtechUSB
        transfer = PalmtechUSB()
    else:
        from serial_transfer import PalmtechSerial
        transfer = PalmtechSerial(port=args.port)

    if not transfer.connect():
        logger.error(f"Failed to establish {args.mode} connection to Palmtech device. Exiting.")
        status_callback(f"Device: Not Connected ({args.mode} Error)")
        return

    status_callback(f"Device: Connected ({args.mode})")

    try:
        if args.mode == "USB" and hasattr(transfer, 'handshake'):
            if not transfer.handshake():
                logger.error("Handshake failed. Aborting transfer.")
                status_callback("Error: Handshake failed")
                return

        if action == "download":
            perform_download(transfer, folder, args.machine_write, get_clean_name, progress_callback, ui_callbacks)
        else:
            perform_upload(transfer, folder, ui_callbacks)
            
        status_callback(f"Finished ({action.upper()})")

    finally:
        transfer.disconnect()
        logger.info("Worker process completed.")
        flush_logs()


def start_gui():
    default_files_folder = os.path.join(APP_DIR, "files")
    parser = argparse.ArgumentParser(description="Palmtech Data Transfer Worker")
    parser.add_argument("--folder", default=default_files_folder)
    parser.add_argument("--action", default="auto", choices=["auto", "upload", "download"])
    parser.add_argument("--machine-write", action="store_true")
    parser.add_argument("--mode", default="USB", choices=["USB", "Serial"])
    parser.add_argument("--port", default="COM1")
    args, unknown = parser.parse_known_args()

    root = tk.Tk()
    root.title("Palmtech Data Transfer")
    root.geometry("700x500")

    # Center window
    window_width = 700
    window_height = 500
    screen_width = root.winfo_screenwidth()
    screen_height = root.winfo_screenheight()
    x = int((screen_width / 2) - (window_width / 2))
    y = int((screen_height / 2) - (window_height / 2))
    root.geometry(f"{window_width}x{window_height}+{x}+{y}")

    try:
        style = ttk.Style(root)
        style.theme_use("clam")
    except:
        pass

    top_frame = ttk.Frame(root, padding=10)
    top_frame.pack(fill=tk.X)

    status_var = tk.StringVar()
    status_var.set("Device: Checking Connection...")
    status_label = ttk.Label(top_frame, textvariable=status_var, font=("Helvetica", 14, "bold"))
    status_label.pack(side=tk.LEFT)
    
    progress_var = tk.DoubleVar()
    progress_bar = ttk.Progressbar(top_frame, variable=progress_var, maximum=100)
    progress_bar.pack(side=tk.RIGHT, padx=10, fill=tk.X, expand=True)

    main_frame = ttk.Frame(root, padding=10)
    main_frame.pack(fill=tk.BOTH, expand=True)

    # Download section
    down_frame = ttk.LabelFrame(main_frame, text="Downloading (PC to Device)")
    down_frame.pack(fill=tk.BOTH, expand=True, pady=5)
    
    down_tree = ttk.Treeview(down_frame, columns=("File", "Status"), show="headings")
    down_tree.heading("File", text="File Name")
    down_tree.heading("Status", text="Status")
    down_tree.column("File", width=200)
    down_tree.column("Status", width=400)
    down_tree.pack(fill=tk.BOTH, expand=True)

    # Upload section
    up_frame = ttk.LabelFrame(main_frame, text="Uploading (Device to PC)")
    up_frame.pack(fill=tk.BOTH, expand=True, pady=5)
    
    up_tree = ttk.Treeview(up_frame, columns=("File", "Status"), show="headings")
    up_tree.heading("File", text="File Name")
    up_tree.heading("Status", text="Status")
    up_tree.column("File", width=200)
    up_tree.column("Status", width=400)
    up_tree.pack(fill=tk.BOTH, expand=True)

    def update_status(msg):
        root.after(0, lambda: status_var.set(msg))

    def update_progress(pct):
        root.after(0, lambda: progress_var.set(pct))

    def add_down_file(filename, status):
        root.after(0, lambda: down_tree.insert("", tk.END, iid=filename, values=(filename, status)))

    def update_down_status(filename, status):
        root.after(0, lambda: down_tree.item(filename, values=(filename, status)))
        
    def add_up_file(filename, status):
        root.after(0, lambda: up_tree.insert("", tk.END, iid=filename, values=(filename, status)))

    def update_up_status(filename, status):
        root.after(0, lambda: up_tree.item(filename, values=(filename, status)))

    def show_popup(title, msg):
        root.after(0, lambda: messagebox.showinfo(title, msg))

    ui_callbacks = {
        'add_down': add_down_file,
        'update_down': update_down_status,
        'add_up': add_up_file,
        'update_up': update_up_status,
        'show_popup': show_popup
    }

    def run_thread():
        try:
            run_transfer_logic(args, update_status, update_progress, ui_callbacks)
        except Exception as e:
            logger.error(f"UNHANDLED EXCEPTION: {e}")
            logger.error(traceback.format_exc())
            update_status("Error: Exception occurred")

    t = threading.Thread(target=run_thread, daemon=True)
    t.start()

    root.mainloop()


def perform_download(transfer, folder, machine_write, get_clean_name, progress_callback=None, ui_callbacks=None):
    """Current download (write to device) logic."""
    import time
    
    # 1. Check if trip and schedule are closed
    status = transfer.read_status()
    if not status.get('trip_closed', True) or not status.get('schedule_closed', True):
        msg = "Download not possible. Please close the Trip / Schedule on the device first."
        logger.error(msg)
        if ui_callbacks and 'show_popup' in ui_callbacks:
            ui_callbacks['show_popup']("Download Error", msg)
        return

    # ── FILES THAT SHOULD NOT BE WRITTEN TO DEVICE ──
    SKIP_FILES = {"MODE.TXT", "VERSION.DAT", "STATUS.DAT", "SCRATCHPAD1.DAT"}

    STRICT_ORDER = [
        "ROUTELST.LST", "BUS.DAT", "LANGUAGE.DAT", "STAGE.LST", "GRSTAGE.LST",
        "RTE.DAT", "CURRENCY.DAT", "CREW.DAT", "VEHICLE.DAT", "EXPENSEDET.DAT"
    ]

    def sort_key(filename):
        f_upper = get_clean_name(filename).upper()
        for i, ordered_name in enumerate(STRICT_ORDER):
            if f_upper == ordered_name.upper():
                return i
        return 999

    all_entries = [f for f in os.listdir(folder) if os.path.isfile(os.path.join(folder, f))]
    files = [f for f in all_entries if get_clean_name(f).upper() not in SKIP_FILES]
    files = sorted(files, key=sort_key)
    
    if machine_write:
        files = [f for f in files if f.lower().endswith('.bin')]

    if not files:
        logger.info("No files found to download. Skipping.")
        return

    logger.info(f"Files to download ({len(files)}): {files}")
    success_count = 0
    fail_count = 0
    
    for idx, filename in enumerate(files, 1):
        filepath = os.path.join(folder, filename)
        clean_filename = get_clean_name(filename)
        logger.info(f"── File {idx}/{len(files)}: {filename} (Sending as {clean_filename}) ──")
        
        if ui_callbacks:
            ui_callbacks['add_down'](clean_filename, "Pending...")
            
        try:
            with open(filepath, 'rb') as f:
                data = f.read()
                
            if ui_callbacks:
                ui_callbacks['update_down'](clean_filename, "Transferring...")
                
            if transfer.send_file(clean_filename, data, progress_callback=progress_callback):
                success_count += 1
                logger.info(f"✅ Successfully sent {filename}.")
                if ui_callbacks:
                    ui_callbacks['update_down'](clean_filename, "Success")
                if not machine_write:
                    try:
                        os.remove(filepath)
                    except:
                        pass
                time.sleep(2.0)
            else:
                fail_count += 1
                logger.error(f"❌ Failed to send {filename}.")
                if ui_callbacks:
                    ui_callbacks['update_down'](clean_filename, "Failed")
                time.sleep(3.0)
        except Exception as e:
            fail_count += 1
            logger.error(f"❌ Error processing {filename}: {e}")
            if ui_callbacks:
                ui_callbacks['update_down'](clean_filename, f"Error: {e}")

    logger.info("═" * 50)
    logger.info(f"Download complete: {success_count} succeeded, {fail_count} failed.")

    if ui_callbacks and 'show_popup' in ui_callbacks:
        ui_callbacks['show_popup']("Transfer Complete", "Master Files Download successfully")


def perform_upload(transfer, folder, ui_callbacks=None):
    """Logic to read files FROM device (Tickets, Reports, etc.)"""
    import time

    # VB Logic: Always read these first
    CORE_UPLOAD = [
        "VERSION.DAT",
        "STATUS.DAT",
        "BUS.DAT",
        "RPT01.DAT",
        "ODOMETER.DAT",
        "EXPENSE.DAT",
        "INSPECTOR.DAT"
    ]

    logger.info("🚀 Starting Upload (Read from Device) Sequence...")
    
    # 1. Handshake checks (Version, Status)
    status = transfer.read_status()
    
    if not status['trip_closed']:
        logger.warning("⚠️ Warning: Trip status is OPEN. Usually, you should close the trip before upload.")
    
    # 2. Get list of all files on device to find dynamic ones (TKTS*.DAT)
    device_files = transfer.get_device_files()
    
    # Filter for TKTS and PASS files
    ticket_files = [f for f in device_files if f.startswith("TKTS") or f in ("PASS.PAS", "T.CON")]
    
    files_to_read = CORE_UPLOAD + ticket_files
    # Remove duplicates while preserving order
    files_to_read = list(dict.fromkeys(files_to_read))
    
    success_count = 0
    fail_count = 0

    for idx, filename in enumerate(files_to_read, 1):
        logger.info(f"── Reading {idx}/{len(files_to_read)}: {filename} ──")
        
        if ui_callbacks:
            ui_callbacks['add_up'](filename, "Reading...")
            
        data = transfer.read_file(filename)
        if data is not None and len(data) > 0:
            # Save to the files folder
            save_path = os.path.join(folder, filename)
            try:
                with open(save_path, 'wb') as f:
                    f.write(data)
                success_count += 1
                logger.info(f"✅ Saved {filename} to local folder.")
                if ui_callbacks:
                    ui_callbacks['update_up'](filename, "Success")
            except Exception as e:
                logger.error(f"❌ Could not save {filename}: {e}")
                if ui_callbacks:
                    ui_callbacks['update_up'](filename, f"Error: {e}")
                fail_count += 1
        else:
            # Note: Core files might be missing on device, that's often OK
            if filename in CORE_UPLOAD:
                logger.info(f"ℹ️ File {filename} not found or empty on device. Skipping.")
                if ui_callbacks:
                    ui_callbacks['update_up'](filename, "Skipped (Not found)")
            else:
                fail_count += 1
                logger.error(f"❌ Failed to read {filename}.")
                if ui_callbacks:
                    ui_callbacks['update_up'](filename, "Failed")
        
        time.sleep(1.0)

    # 3. Finalization
    if success_count > 0:
        if hasattr(transfer, 'end_transfer'):
            transfer.end_transfer() # Sends 'o@'
        
        # VB Logic: Ask to delete tickets (we'll do it if there's ticket data)
        if any(f.startswith("TKTS") for f in files_to_read):
            logger.info("Tickets were uploaded. Clearing device ticket data...")
            transfer.delete_tickets() # Sends 'r@DELETETKTS'
    
    logger.info("═" * 50)
    logger.info(f"Upload complete: {success_count} files received, {fail_count} failed.")
    
    if ui_callbacks and 'show_popup' in ui_callbacks:
        ui_callbacks['show_popup']("Transfer Complete", "Files Upload successfully")


if __name__ == "__main__":
    try:
        start_gui()
    except Exception as e:
        logger.error(f"UNHANDLED EXCEPTION: {e}")
        logger.error(traceback.format_exc())
    finally:
        logger.info("Application finished.")
        flush_logs()
