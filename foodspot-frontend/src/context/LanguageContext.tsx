import { createContext, useContext, useState } from 'react'

export type Lang = 'en' | 'ml'

interface Translations {
  subtitle: string
  supporting: string
  scroll: string
  explore_label: string
  discover_head: string
  discover_mark: string
  categories: string[]
  share_cta_l1: string
  share_cta_l2: string
  first: string
  discoveries: (n: number) => string
  districts: Record<string, string>
  modal_title1: string
  modal_title2: string
  modal_sub: string
  add_photo: string
  tap_upload: string
  what_label: string
  what_ph: string
  what_chars: (n: number) => string
  where_label: string
  use_location: string
  locating: string
  location_saved: string
  place_ph: string
  cant_find: string
  describe_ph: string
  share_btn: string
  trust: string
  success_title: string
  success_sub: string
  success_close: string
}

const TRANSLATIONS: Record<Lang, Translations> = {
  en: {
    subtitle:       'Is there any food spot here?',
    supporting:     'Hidden food spots. Real people. Honest sharing.',
    scroll:         'Scroll to explore',
    explore_label:  'Explore Kerala',
    discover_head:  'Discover hidden food spots across',
    discover_mark:  'Kerala.',
    categories:     ['Tea Spots', 'Evening Snacks', 'Meals', 'Bakery & Sweets', 'Night Spots', 'Local Gems'],
    share_cta_l1:   'SHARE',
    share_cta_l2:   'DISCOVERY',
    first:          'Be the first!',
    discoveries:    (n) => `${n} Food Discoveries`,
    districts: {
      Kasaragod: 'Kasaragod', Kannur: 'Kannur', Wayanad: 'Wayanad',
      Kozhikode: 'Kozhikode', Malappuram: 'Malappuram', Palakkad: 'Palakkad',
      Thrissur: 'Thrissur', Ernakulam: 'Ernakulam', Idukki: 'Idukki',
      Kottayam: 'Kottayam', Alappuzha: 'Alappuzha', Pathanamthitta: 'Pathanamthitta',
      Kollam: 'Kollam', Thiruvananthapuram: 'Thiruvananthapuram',
    },
    modal_title1:   'Found a hidden',
    modal_title2:   'food spot?',
    modal_sub:      'Share it with your community ❤️',
    add_photo:      'Add a photo',
    tap_upload:     'Tap to upload',
    what_label:     '🍲 What did you find?',
    what_ph:        'E.g. Best pazhampori after 4 PM, hidden biriyani behind the mosque...',
    what_chars:     (n) => `${n}/80`,
    where_label:    '📍 Where is it?',
    use_location:   'Use my location',
    locating:       'Locating...',
    location_saved: 'Location saved',
    place_ph:       'Search for a place or area',
    cant_find:      "✏  Can't find the place?",
    describe_ph:    'Describe the location (near landmark, area, etc.)',
    share_btn:      'SHARE FOOD SPOT',
    trust:          'Your info is safe with us',
    success_title:  'Shared! 🎉',
    success_sub:    'Thank you for sharing your discovery with Kerala.',
    success_close:  'Close',
  },
  ml: {
    subtitle:       'ഇവിടെ ഒരു ഭക്ഷണ സ്ഥലം ഉണ്ടോ?',
    supporting:     'മറഞ്ഞ ഭക്ഷണ സ്ഥലങ്ങൾ. യഥാർഥ ആളുകൾ. സത്യസന്ധമായ പങ്കുവെക്കൽ.',
    scroll:         'കൂടുതൽ കാണൂ',
    explore_label:  'കേരളം',
    discover_head:  'കേരളത്തിലുടനീളം ഭക്ഷണ സ്ഥലങ്ങൾ',
    discover_mark:  'കണ്ടെത്തൂ.',
    categories:     ['ചായക്കടകൾ', 'വൈകുന്നേര ലഘുഭക്ഷണം', 'ഊണ്', 'ബേക്കറി & മധുരം', 'രാത്രി ഭക്ഷണം', 'ലോക്കൽ ഗെംസ്'],
    share_cta_l1:   'പങ്കിടൂ',
    share_cta_l2:   'കണ്ടെത്തൽ',
    first:          'ആദ്യം ആകൂ!',
    discoveries:    (n) => `${n} ഭക്ഷണ കണ്ടെത്തലുകൾ`,
    districts: {
      Kasaragod: 'കാസർഗോഡ്', Kannur: 'കണ്ണൂർ', Wayanad: 'വയനാട്',
      Kozhikode: 'കോഴിക്കോട്', Malappuram: 'മലപ്പുറം', Palakkad: 'പാലക്കാട്',
      Thrissur: 'തൃശൂർ', Ernakulam: 'എറണാകുളം', Idukki: 'ഇടുക്കി',
      Kottayam: 'കോട്ടയം', Alappuzha: 'ആലപ്പുഴ', Pathanamthitta: 'പത്തനംതിട്ട',
      Kollam: 'കൊല്ലം', Thiruvananthapuram: 'തിരുവനന്തപുരം',
    },
    modal_title1:   'ഒരു ഭക്ഷണ സ്ഥലം',
    modal_title2:   'കണ്ടെത്തിയോ?',
    modal_sub:      'കമ്മ്യൂണിറ്റിയുമായി പങ്കുവെക്കൂ ❤️',
    add_photo:      'ഫോട്ടോ ചേർക്കൂ',
    tap_upload:     'ടാപ്പ് ചെയ്ത് അപ്‌ലോഡ്',
    what_label:     '🍲 എന്ത് കണ്ടെത്തി?',
    what_ph:        'ഉദാ: 4 PM ന് ശേഷം മികച്ച പഴംപൊരി, പള്ളിക്ക് പിന്നിൽ ഒളിഞ്ഞ ബിരിയാണി...',
    what_chars:     (n) => `${n}/80`,
    where_label:    '📍 എവിടെ ആണ്?',
    use_location:   'ലൊക്കേഷൻ',
    locating:       'കണ്ടെത്തുന്നു...',
    location_saved: 'ലൊക്കേഷൻ ലഭിച്ചു',
    place_ph:       'ഒരു സ്ഥലം അല്ലെങ്കിൽ ഏരിയ തിരയൂ',
    cant_find:      '✏  സ്ഥലം കണ്ടെത്താൻ കഴിഞ്ഞില്ലേ?',
    describe_ph:    'ലൊക്കേഷൻ വിവരിക്കൂ (ലാൻഡ്‌മാർക്ക്, ഏരിയ...)',
    share_btn:      'ഷെയർ ചെയ്യൂ',
    trust:          'നിങ്ങളുടെ വിവരങ്ങൾ സുരക്ഷിതമാണ്',
    success_title:  'ഷെയർ ചെയ്തു! 🎉',
    success_sub:    'കേരളവുമായി നിങ്ങളുടെ കണ്ടെത്തൽ പങ്കിട്ടതിന് നന്ദി.',
    success_close:  'അടയ്ക്കൂ',
  },
}

interface LanguageCtx {
  lang: Lang
  setLang: (l: Lang) => void
  t: Translations
}

const Ctx = createContext<LanguageCtx>({
  lang: 'en',
  setLang: () => {},
  t: TRANSLATIONS.en,
})

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() =>
    (localStorage.getItem('fs-lang') as Lang) ?? 'en'
  )

  const setLang = (l: Lang) => {
    setLangState(l)
    localStorage.setItem('fs-lang', l)
  }

  return (
    <Ctx.Provider value={{ lang, setLang, t: TRANSLATIONS[lang] }}>
      {children}
    </Ctx.Provider>
  )
}

export const useLanguage = () => useContext(Ctx)
