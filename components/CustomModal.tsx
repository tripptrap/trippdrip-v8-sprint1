'use client';

import { ReactNode } from 'react';

type ModalType = 'success' | 'error' | 'warning' | 'info' | 'confirm';

interface CustomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  type?: ModalType;
  title: string;
  message: string | ReactNode;
  confirmText?: string;
  cancelText?: string;
  icon?: string;
}

export default function CustomModal({
  isOpen,
  onClose,
  onConfirm,
  type = 'info',
  title,
  message,
  confirmText = 'OK',
  cancelText = 'Cancel',
  icon
}: CustomModalProps) {
  if (!isOpen) return null;

  const getColors = () => {
    switch (type) {
      case 'success':
        return {
          gradient: 'from-green-900/20 to-emerald-900/20',
          border: 'border-green-500/30',
          bg: 'bg-green-500/10',
          text: 'text-green-400',
          button: 'bg-green-600 hover:bg-green-700 border-green-500/50'
        };
      case 'error':
        return {
          gradient: 'from-red-900/20 to-orange-900/20',
          border: 'border-red-500/30',
          bg: 'bg-red-500/10',
          text: 'text-red-400',
          button: 'bg-red-600 hover:bg-red-700 border-red-500/50'
        };
      case 'warning':
        return {
          gradient: 'from-yellow-900/20 to-orange-900/20',
          border: 'border-yellow-500/30',
          bg: 'bg-yellow-500/10',
          text: 'text-yellow-400',
          button: 'bg-yellow-600 hover:bg-yellow-700 border-yellow-500/50'
        };
      case 'confirm':
        return {
          gradient: 'from-blue-900/20 to-cyan-900/20',
          border: 'border-blue-500/30',
          bg: 'bg-blue-500/10',
          text: 'text-blue-400',
          button: 'bg-blue-600 hover:bg-blue-700 border-blue-500/50'
        };
      default:
        return {
          gradient: 'from-gray-900/20 to-slate-900/20',
          border: 'border-white/30',
          bg: 'bg-white/10',
          text: 'text-white',
          button: 'bg-blue-600 hover:bg-blue-700 border-blue-500/50'
        };
    }
  };

  const colors = getColors();

  const getDefaultIcon = () => {
    switch (type) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'confirm': return '❓';
      default: return 'ℹ️';
    }
  };

  return (
    <div
      className="fixed inset-0 md:left-64 bg-black/50 flex items-center justify-center z-[9999]"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`bg-gradient-to-r ${colors.gradient} border-b border-white/10 px-6 py-4`}>
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full ${colors.bg} border ${colors.border} flex items-center justify-center`}>
              <span className="text-2xl">{icon || getDefaultIcon()}</span>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{title}</h3>
              <p className="text-sm text-white/60">
                {type === 'confirm' ? 'Please confirm your action' : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          <div className="text-sm text-white/90 whitespace-pre-wrap">
            {message}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white/5 border-t border-white/10 px-6 py-4 flex gap-3 justify-end">
          {type === 'confirm' && onConfirm ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-white/10 hover:bg-white/20 border border-white/20 transition-colors"
              >
                {cancelText}
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${colors.button} border transition-colors`}
              >
                {confirmText}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${colors.button} border transition-colors`}
            >
              {confirmText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
