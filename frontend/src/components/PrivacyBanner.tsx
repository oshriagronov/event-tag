import { ShieldCheck } from 'lucide-react';

export function PrivacyBanner() {
  return (
    <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-start gap-4 text-right">
      <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
      <div>
        <h4 className="font-semibold text-emerald-300 text-base">פרטיות מוחלטת מובטחת</h4>
        <p className="text-emerald-400/80 text-sm mt-1 leading-relaxed">
          כל התמונות, זיהוי הפנים והנתונים מעובדים ומאוחסנים באופן מקומי לחלוטין בדפדפן שלך.
          אף תמונה, מפתח פנים או מידע מזהה אינם נשלחים לשרת כלשהו ועוזבים את המחשב שלך.
        </p>
      </div>
    </div>
  );
}
