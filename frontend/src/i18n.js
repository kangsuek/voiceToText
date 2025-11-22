import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ko from './locales/ko.json';

// 브라우저에서 저장된 언어 또는 기본값(영어)
const savedLanguage = localStorage.getItem('language') || 'en';

i18n
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: en },
            ko: { translation: ko }
        },
        lng: savedLanguage,
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false
        }
    });

export default i18n;
