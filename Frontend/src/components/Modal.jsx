import React from 'react';

const Modal = ({ isOpen, onClose, title, children, wide = false, narrow = false }) => {
  if (!isOpen) return null;

  const sizeClass = wide ? 'max-w-5xl' : narrow ? 'max-w-sm' : 'max-w-2xl';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">

      {/* Backdrop with Blur */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 pointer-events-none"
        onClick={onClose}
      ></div>

      {/* Modal Content */}
      <div
        className={`relative w-full ${sizeClass} bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-modal-pop border border-slate-100 pointer-events-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl">
          <h3 className="text-xl font-bold text-slate-800 tracking-tight">
            {title}
          </h3>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body (Scrollable) */}
        <div className="p-6 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;