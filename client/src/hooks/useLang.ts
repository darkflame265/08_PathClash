import { useState } from 'react';
import { translations, type Lang } from '../i18n/translations';

export function useLang() {
  const [lang, setLang] = useState<Lang>(() => {
    const stored = localStorage.getItem('lang');
    return stored === 'en' || stored === 'kr' ? stored : 'en';
  });

  const toggleLang = () => {
    const next: Lang = lang === 'en' ? 'kr' : 'en';
    localStorage.setItem('lang', next);
    setLang(next);
  };

  return { lang, toggleLang, t: translations[lang] };
}
