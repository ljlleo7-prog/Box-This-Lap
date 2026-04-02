import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale, translations } from './translations';

const STORAGE_KEY = 'box-this-lap.locale';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
  t: (key) => key,
});

const isLocale = (value: string | null): value is Locale => {
  return value !== null && (SUPPORTED_LOCALES as readonly string[]).includes(value);
};

const detectInitialLocale = (): Locale => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (isLocale(stored)) return stored;
  const browser = navigator.language.toLowerCase();
  if (browser.startsWith('zh')) return 'zh-CN';
  return DEFAULT_LOCALE;
};

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(detectInitialLocale);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
  }, []);

  const t = useCallback(
    (key: string) => {
      const currentLocaleTable = translations[locale];
      const defaultLocaleTable = translations[DEFAULT_LOCALE];
      return currentLocaleTable[key] ?? defaultLocaleTable[key] ?? key;
    },
    [locale],
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
    }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => useContext(I18nContext);
