import { useGameStore } from '../store/gameStore';
import { translations } from '../i18n/translations';

export function useLang() {
  const lang = useGameStore((s) => s.lang);
  const setLang = useGameStore((s) => s.setLang);

  const toggleLang = () => {
    setLang(lang === 'en' ? 'kr' : 'en');
  };

  return { lang, toggleLang, t: translations[lang] };
}
