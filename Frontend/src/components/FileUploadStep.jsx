import { useRef } from 'react';

// ---------------------------------------------------------------
// FileUploadStep — Step 1
// Responsible ONLY for: showing the drop zone or file preview
// All state lives in the parent (MdbImport.jsx)
// ---------------------------------------------------------------

// Helper: convert raw bytes to readable string
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Helper: check file is .mdb
function isValidMdbFile(file) {
  return file?.name?.toLowerCase().endsWith('.mdb');
}

export default function FileUploadStep({ selectedFile, isDragging, onFileSelect, onFileRemove, onDragChange, onContinue }) {
  const fileInputRef = useRef(null);

  // ---- Drag Events ----
  const handleDragOver = (e) => {
    e.preventDefault();
    onDragChange(true);   // tell parent dragging is happening
  };

  const handleDragLeave = () => onDragChange(false);

  const handleDrop = (e) => {
    e.preventDefault();
    onDragChange(false);
    const file = e.dataTransfer.files[0];
    if (file && isValidMdbFile(file)) {
      onFileSelect(file);   // pass file up to parent
    } else {
      window.alert('Please drop a valid .mdb file.');
    }
  };

  // ---- Browse (click) ----
  const handleFileInputChange = (e) => {
    const file = e.target.files[0];
    if (file && isValidMdbFile(file)) {
      onFileSelect(file);
    } else {
      window.alert('Please select a valid .mdb file.');
    }
    e.target.value = ''; // reset so same file can be picked again
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-800">Select MDB File</h2>
        <p className="text-sm text-slate-500 mt-0.5">Drag and drop your .mdb file or click to browse.</p>
      </div>

      {/* Show drop zone if no file, show preview if file selected */}
      {!selectedFile ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all
            ${isDragging
              ? 'border-slate-500 bg-slate-50 scale-[1.01]'
              : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'}`}
        >
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 7c0-1.657 3.582-3 8-3s8 1.343 8 3M4 7v5c0 1.657 3.582 3 8 3s8-1.343 8-3V7M4 7c0 1.657 3.582 3 8 3s8-1.343 8-3" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 17c0 1.657 3.582 3 8 3s8-1.343 8-3v-5" />
              </svg>
            </div>
          </div>
          <p className="text-sm font-medium text-slate-700">
            {isDragging ? 'Drop your file here' : 'Drag & drop your .mdb file here'}
          </p>
          <p className="text-xs text-slate-400 mt-1">or click to browse</p>
          <p className="text-xs text-slate-400 mt-3 bg-slate-100 inline-block px-3 py-1 rounded-full">
            Only .mdb files accepted
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mdb"
            onChange={handleFileInputChange}
            className="hidden"
          />
        </div>
      ) : (
        // File selected preview card
        <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 break-all">{selectedFile.name}</p>
              <p className="text-xs text-slate-500">{formatFileSize(selectedFile.size)}</p>
            </div>
          </div>
          <button
            onClick={onFileRemove}
            className="ml-3 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors flex-shrink-0"
            title="Remove file"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="flex justify-end pt-2">
        <button
          onClick={onContinue}
          disabled={!selectedFile}
          className="px-5 py-2 text-sm font-medium text-white bg-slate-800 rounded-lg hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm flex items-center gap-2"
        >
          Continue
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}