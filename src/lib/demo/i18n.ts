export type Language = "en" | "as" | "hi";

const labels = {
  en: { "nav.newChat": "New chat", "nav.search": "Search", "nav.cases": "Cases", "nav.documents": "Documents", "nav.workflows": "Workflows", "nav.logs": "Logs", "nav.recent": "Recent", "profile.myProfile": "My profile", "profile.settings": "Settings", "profile.language": "Language", "profile.appearance": "Appearance", "profile.help": "Help", "search.ask": "Ask a question...", "search.followup": "Ask a follow-up...", "common.save": "Save changes", "common.cancel": "Cancel", "common.englishFallback": "Some workspace content is shown in English where a verified translation is unavailable." },
  as: { "nav.newChat": "নতুন কথোপকথন", "nav.search": "অনুসন্ধান", "nav.cases": "গোচৰসমূহ", "nav.documents": "নথিপত্ৰ", "nav.workflows": "কৰ্মপ্ৰবাহ", "nav.logs": "কাৰ্যকলাপৰ বিৱৰণ", "nav.recent": "শেহতীয়া", "profile.myProfile": "মোৰ প্ৰ'ফাইল", "profile.settings": "ছেটিংছ", "profile.language": "ভাষা", "profile.appearance": "দৃশ্যৰূপ", "profile.help": "সহায়", "search.ask": "প্ৰশ্ন সোধক...", "search.followup": "পৰৱৰ্তী প্ৰশ্ন সোধক...", "common.save": "পৰিৱৰ্তন সংৰক্ষণ কৰক", "common.cancel": "বাতিল কৰক", "common.englishFallback": "নিৰ্ভৰযোগ্য অনুবাদ উপলব্ধ নথকা কাৰ্যক্ষেত্ৰৰ কিছু বিষয়বস্তু ইংৰাজীত দেখুওৱা হৈছে।" },
  hi: { "nav.newChat": "नई बातचीत", "nav.search": "खोजें", "nav.cases": "मामले", "nav.documents": "दस्तावेज़", "nav.workflows": "कार्यप्रवाह", "nav.logs": "गतिविधि लॉग", "nav.recent": "हाल के", "profile.myProfile": "मेरी प्रोफ़ाइल", "profile.settings": "सेटिंग्स", "profile.language": "भाषा", "profile.appearance": "रूप", "profile.help": "सहायता", "search.ask": "प्रश्न पूछें...", "search.followup": "आगे का प्रश्न पूछें...", "common.save": "परिवर्तन सहेजें", "common.cancel": "रद्द करें", "common.englishFallback": "जहाँ सत्यापित अनुवाद उपलब्ध नहीं है, वहाँ कार्यक्षेत्र की कुछ सामग्री अंग्रेज़ी में दिखाई जाती है।" },
} as const;

export type LabelKey = keyof typeof labels.en;
export function translate(language: Language, key: LabelKey) { return labels[language]?.[key] ?? labels.en[key]; }
export const languageNames: Record<Language, string> = { en: "English", as: "অসমীয়া", hi: "हिन्दी" };
