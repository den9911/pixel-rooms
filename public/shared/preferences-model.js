export const languages = ['en','es','ru'];
export function resolveLanguage(saved, preferred = []) {
  if (languages.includes(saved)) return saved;
  for (const value of preferred) {
    const language=String(value).toLowerCase().split(/[-_]/)[0];
    if(languages.includes(language))return language;
  }
  return 'en';
}
export function resolveTheme(choice, prefersDark = false) {
  return choice==='dark'||choice==='light'?choice:prefersDark?'dark':'light';
}
