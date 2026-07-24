import { useState, useEffect } from 'react';
import { Share2, X, Copy, Check, QrCode, Mail, Send, MessageCircle, ExternalLink, Sparkles } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from '../services/translations';
import { getShareUrl, getShareText, handleShareEvent } from '../utils/shareUtils';

export interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: {
    id: string;
    name: string;
  };
}

export function ShareModal({ isOpen, onClose, event }: ShareModalProps) {
  const { t, language, isRtl } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !event) return null;

  const shareUrl = getShareUrl(event.id);
  const shareText = getShareText(event.name, language);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      prompt(t('share.shareUrlLabel'), shareUrl);
    }
  };

  const handleNativeShare = async () => {
    await handleShareEvent({
      eventId: event.id,
      eventName: event.name,
      language,
    });
  };

  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedText = encodeURIComponent(shareText);
  const encodedEventName = encodeURIComponent(event.name);

  const sharePlatforms = [
    {
      id: 'whatsapp',
      name: t('share.whatsApp'),
      href: `https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`,
      icon: MessageCircle,
      className: 'bg-[#25D366]/10 text-[#25D366] border-[#25D366]/30 hover:bg-[#25D366]/20 hover:border-[#25D366]/60',
    },
    {
      id: 'telegram',
      name: t('share.telegram'),
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      icon: Send,
      className: 'bg-[#229ED9]/10 text-[#229ED9] border-[#229ED9]/30 hover:bg-[#229ED9]/20 hover:border-[#229ED9]/60',
    },
    {
      id: 'email',
      name: t('share.email'),
      href: `mailto:?subject=${encodedEventName}&body=${encodeURIComponent(`${shareText}\n\n${shareUrl}`)}`,
      icon: Mail,
      className: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/20 hover:border-indigo-500/60',
    },
    {
      id: 'facebook',
      name: t('share.facebook'),
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      icon: ExternalLink,
      className: 'bg-[#1877F2]/10 text-[#1877F2] border-[#1877F2]/30 hover:bg-[#1877F2]/20 hover:border-[#1877F2]/60',
    },
    {
      id: 'twitter',
      name: t('share.twitter'),
      href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`,
      icon: Share2,
      className: 'bg-zinc-800/80 text-zinc-200 border-zinc-700 hover:bg-zinc-700/80 hover:border-zinc-500',
    },
  ];

  const hasNativeShare = typeof navigator !== 'undefined' && Boolean(navigator.share);

  return (
    <>
      {/* Overlay Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Container */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg bg-surface-container border border-surface-border rounded-2xl shadow-2xl p-6 sm:p-7 flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-2 border-b border-surface-border">
          <div className="flex items-center gap-3 text-start">
            <div className="p-2.5 rounded-xl bg-copper-accent/15 border border-copper-accent/25 text-copper-accent shrink-0">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 id="share-modal-title" className="text-xl font-bold text-on-surface m-0 leading-tight">
                {t('share.title')}
              </h2>
              <p className="text-xs text-sage-muted m-0 mt-0.5 leading-normal">
                {t('share.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-container-high text-sage-muted hover:text-on-background transition-colors cursor-pointer border-none bg-transparent shrink-0"
            title={t('common.close')}
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Event Name Pill */}
        <div className="bg-surface-container-low border border-surface-border/80 rounded-xl p-3 flex items-center gap-2 text-start">
          <Sparkles className="w-4 h-4 text-copper-accent shrink-0" />
          <span className="text-xs text-sage-muted font-bold uppercase tracking-wider shrink-0">{t('dashboard.eventNameLabel')}</span>
          <span className="text-sm font-semibold text-on-surface truncate bidi-isolate" dir="auto">{event.name}</span>
        </div>

        {/* System OS Share Button (If Supported) */}
        {hasNativeShare && (
          <button
            onClick={handleNativeShare}
            className="w-full py-3 px-4 rounded-xl bg-copper-accent hover:bg-copper-accent/90 text-background font-bold text-sm shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer border-none active:scale-[0.99]"
          >
            <Share2 className="w-4 h-4 shrink-0" />
            <span>{t('share.openSystemShare')}</span>
          </button>
        )}

        {/* Share Link Copy Field */}
        <div className="flex flex-col gap-2 text-start">
          <label className="text-xs font-bold uppercase tracking-wider text-sage-muted">
            {t('share.shareUrlLabel')}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-grow px-4 py-2.5 rounded-xl bg-surface-container-low border border-surface-border text-sage-muted text-xs font-mono focus:outline-none min-w-0"
            />
            <button
              onClick={handleCopyLink}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs shadow flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0 border border-surface-border ${
                copied
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  : 'bg-surface-container-high hover:bg-surface-container-high/80 text-on-background hover:text-copper-accent'
              }`}
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? t('share.copied') : t('share.copyLink')}</span>
            </button>
          </div>
        </div>

        {/* Social Platforms Grid */}
        <div className="flex flex-col gap-2 text-start">
          <label className="text-xs font-bold uppercase tracking-wider text-sage-muted">
            {t('share.shareEvent')}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {sharePlatforms.map((platform) => {
              const IconComponent = platform.icon;
              return (
                <a
                  key={platform.id}
                  href={platform.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`p-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition-all no-underline shadow-sm active:scale-95 ${platform.className}`}
                >
                  <IconComponent className="w-4 h-4 shrink-0" />
                  <span className="truncate">{platform.name}</span>
                </a>
              );
            })}
          </div>
        </div>

        {/* Toggle QR Code Display */}
        <div className="border-t border-surface-border pt-4 flex flex-col items-center gap-3">
          <button
            onClick={() => setShowQr((prev) => !prev)}
            className="px-4 py-2 rounded-xl bg-surface-container-low border border-surface-border text-sage-muted hover:text-copper-accent transition-colors font-bold text-xs flex items-center gap-2 cursor-pointer"
          >
            <QrCode className="w-4 h-4 shrink-0" />
            <span>{showQr ? t('share.hideQrCode') : t('share.showQrCode')}</span>
          </button>

          {showQr && (
            <div className="bg-white p-4 rounded-xl shadow-lg border border-surface-border flex flex-col items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
              <QRCodeSVG value={shareUrl} size={180} level="H" includeMargin />
              <span className="text-[11px] text-zinc-600 font-mono text-center max-w-[200px] truncate">
                {event.name}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
