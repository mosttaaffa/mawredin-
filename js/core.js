/* الأساس: أيقونات، أدوات، إفكتات، الاتصال بقاعدة البيانات، التوجيه، هيكل الصفحة */
/* =================== أيقونات =================== */
const I = {
  list:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></svg>',
  user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/></svg>',
  trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/></svg>',
  clip:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m20 11.5-8.2 8.2a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9"/></svg>',
  card:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10.5h18M7 15h4"/></svg>',
  chevL:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m14.5 6-6 6 6 6"/></svg>',
  layers:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12.5 9 5 9-5"/><path d="m3 17 9 5 9-5"/></svg>',
  hanger:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7.5a2 2 0 1 1 2-2"/><path d="M12 7.5v1.2L3.6 15a1.2 1.2 0 0 0 .7 2.2h15.4a1.2 1.2 0 0 0 .7-2.2L12 8.7"/></svg>',
  cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01"/></svg>',
  filter:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/></svg>',
  sort:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4v16M8 20l-3.5-3.5M8 20l3.5-3.5M16 20V4M16 4l-3.5 3.5M16 4l3.5 3.5"/></svg>',
  wallet:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7V5.5A1.5 1.5 0 0 0 17.5 4h-12A2.5 2.5 0 0 0 3 6.5v11A2.5 2.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V9a2 2 0 0 0-2-2H5.5"/><path d="M16 13.5h.01"/></svg>',
  dots:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="19" r="1.3"/></svg>',
  warn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2h.01"/></svg>',
  okc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.4 2.4 4.6-5"/></svg>',
  pause:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M10 9v6M14 9v6"/></svg>',
  help:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2.1-2.4 3.6M12 17h.01"/></svg>',
  bag:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>',
  stats:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20V12M10 20V8M15 20v-6M20 20V4"/></svg>',
  handshake:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m11 17 2 2a1.4 1.4 0 0 0 2-2"/><path d="m14 14 2.5 2.5a1.4 1.4 0 0 0 2-2l-3.8-3.8a3 3 0 0 0-4.2 0l-.9.9a1.4 1.4 0 0 1-2-2l2.8-2.8a5 5 0 0 1 5.3-1.1l.4.2 2.4-1.2 1.5 7.4"/><path d="M3.5 6.6 5 14l6.5 6.5a1.4 1.4 0 0 0 2-2"/><path d="M3.5 6.6 6 5.4l3.6 1"/></svg>',
  invadd:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"/><path d="M13 3v5h5M13 3l5 5v3"/><path d="M8.5 12h4M8.5 15.5h2"/><circle cx="17" cy="17.5" r="3.5"/><path d="M17 16v3M15.5 17.5h3"/></svg>',
  coins2:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="7" ry="2.6"/><path d="M5 6v4c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6"/><path d="M5 10v4c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-4"/><path d="M5 14v4c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-4"/></svg>',
  phone:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
  truck:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6h11v10H2z"/><path d="M13 9h4l4 4v3h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/><path d="M4 9h3M4 12h5"/></svg>',
  store:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3"/><path d="M5 12v8h14v-8"/><path d="M10 20v-5h4v5"/></svg>',
  coins:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v4c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 10v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4"/><path d="M5 14v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4"/></svg>',
  clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  arrowL:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/></svg>',
  down:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M6 13l6 6 6-6"/></svg>',
  up:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>',
  home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/></svg>',
  grid:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
  emp:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>',
  loan:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  safe:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M12 9v-1M15 12h1M7 20v1M17 20v1"/></svg>',
  bank:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/></svg>',
  expense:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h3"/></svg>',
  folder:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  chev:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  ret:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
  disc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5L5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
  chart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="7" rx="1"/><rect x="12" y="7" width="3" height="11" rx="1"/><rect x="17" y="13" width="3" height="5" rx="1"/></svg>',
  bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  doc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>',
  wa:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4a.5.5 0 0 0 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .2-1.2c-.1-.1-.3-.2-.5-.3z"/></svg>',
  img:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  print:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
  xls:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 12l6 6M15 12l-6 6"/></svg>',
  save:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
  hist:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 3"/></svg>',
  scan:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/></svg>',
  back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  refresh:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  users:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 14h6M16 10h2"/></svg>',
  gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  receipt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l3-2 3 2 2-2 2 2 3-2 3 2V2l-3 2-3-2-2 2-2-2-3 2z"/><path d="M8 9h8M8 13h6"/></svg>',
  cash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>',
  transfer:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 10h6l-2-2M15 14H9l2 2"/></svg>',
  camera:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  close:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  box:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
  logout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  share:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
};
const METHOD = {cash:'كاش', check:'شيك', transfer:'تحويل', return:'مرتجع', discount:'خصم'};
const IS_ADJ = m => m === 'return' || m === 'discount';
const INV_ST = {paid:'مدفوعة', partial:'مدفوعة جزئيًا', unpaid:'لسه'};
const CHK = {pending:'لسه ما اتصرفش', cleared:'مسدد بالكامل', bounced:'مرتجع من البنك', cancelled:'ملغي', replaced:'مستبدل بشيك آخر'};
const CHK_PAY = {unpaid:'لم يُسدد', partial:'مسدد جزئيًا', paid:'مسدد بالكامل', bounced:'مرتجع من البنك', cancelled:'ملغي', replaced:'مستبدل بشيك آخر'};
const CHK_DUE = {notdue:'لم يحن موعده', due:'مستحق السداد', overdue:'متأخر عن السداد'};
const CP_METHOD = {cash:'نقدي', transfer:'تحويل بنكي', instapay:'InstaPay', wallet:'محفظة إلكترونية', bank_debit:'خصم من البنك مقابل الشيك', other:'طريقة أخرى'};
// المتبقي من الشيك (بالجنيه)
const chkRem = c => c.remaining != null ? Number(c.remaining) : (c.method === 'check' && c.check_status === 'pending' ? checkInfo(c).remaining / 100 : 0);
function chkTags(c){
  const i = checkInfo(c), cls = {unpaid:'pending', partial:'partial', paid:'cleared'}[i.pay] || c.check_status;
  return `<span class="tag ${cls}">${CHK_PAY[i.pay]}</span>${i.due ? `<span class="tag due-${i.due}">${CHK_DUE[i.due]}</span>` : ''}`;
}

/* =================== أدوات =================== */
const $ = (s, r=document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => `<span class="m"><span class="num">${Number(n||0).toLocaleString('en-US',{maximumFractionDigits:2})}</span> ج</span>`;
const fmtDateTime = t => { if(!t) return ''; const d = new Date(t); return d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('ar-EG', {hour:'numeric', minute:'2-digit'}); };
const fmtDate = d => { if(!d) return ''; const [y,m,dd] = String(d).slice(0,10).split('-'); return `<span class="num">${dd}/${m}/${y}</span>`; };
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); };
const daysUntil = d => Math.round((new Date(d+'T00:00:00') - new Date(today()+'T00:00:00')) / 864e5);
const shortName = e => (e||'').split('@')[0];
// اسم العرض للمستخدم (بدل الإيميل) في السجل وتفاصيل العمليات
function who(email){
  if(!email) return 'النظام';
  const m = (typeof store !== 'undefined' && store.eff?.members?.get(String(email).toLowerCase())) || null;
  return (m && m.display_name) || shortName(email);
}

function toast(msg, err=false){
  document.querySelectorAll('.toast').forEach(t=>t.remove());
  const t = document.createElement('div'); t.className = 'toast' + (err?' err':''); t.textContent = msg;
  document.body.appendChild(t); setTimeout(()=>t.remove(), err?4500:2400);
}
let busyEl = null;
function busy(on){
  if(on && !busyEl){ busyEl = document.createElement('div'); busyEl.className='busy'; busyEl.innerHTML='<div class="spin"></div>'; document.body.appendChild(busyEl); }
  if(!on && busyEl){ busyEl.remove(); busyEl = null; }
}
function errMsg(e){
  const m = (e && (e.message || e.error_description || e.msg)) || String(e);
  if(/Invalid login credentials/i.test(m)) return 'الإيميل أو كلمة السر غلط';
  if(/Email not confirmed/i.test(m)) return 'لازم تأكد الإيميل الأول من الرسالة اللي جاتلك';
  if(/already registered/i.test(m)) return 'الإيميل ده عنده حساب بالفعل — اعمل دخول';
  if(/Password should be/i.test(m)) return 'كلمة السر لازم تكون 6 حروف على الأقل';
  if(/duplicate key.*suppliers_name/i.test(m)) return 'فيه مورد بنفس الاسم';
  if(/duplicate key.*members/i.test(m)) return 'الإيميل ده مضاف بالفعل';
  if(/foreign key/i.test(m)) return 'المورد ده عليه فواتير أو دفعات — امسحها الأول';
  if(/row-level security/i.test(m)) return 'مش مسموح — حسابك مش مضاف للتطبيق';
  if(/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'مفيش إنترنت — جرّب تاني';
  return m;
}

/* ضغط الصورة قبل الرفع (أسرع وأوفر) */
function compressImage(file, maxSide=1400, quality=0.72){
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let {width:w, height:h} = img;
      const s = Math.min(1, maxSide / Math.max(w,h)); w = Math.round(w*s); h = Math.round(h*s);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      c.toBlob(b => { URL.revokeObjectURL(url); resolve(b || file); }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}


/* =================== إفكتات =================== */
const REDUCED = false; // الأنيميشن شغال دايمًا
const buzz = (ms=12) => { try{ navigator.vibrate && navigator.vibrate(ms); }catch(e){} };

// موجة عند الضغط
document.addEventListener('pointerdown', e => {
  const el = e.target.closest('.btn,.fab,.iconbtn,.chip,.seg button,.list .item,nav.bottom a');
  if(!el || REDUCED) return;
  const r = el.getBoundingClientRect(), d = document.createElement('span');
  d.className = 'rp'; d.style.left = (e.clientX - r.left) + 'px'; d.style.top = (e.clientY - r.top) + 'px';
  el.appendChild(d); setTimeout(() => d.remove(), 600);
}, {passive:true});

// عدّاد الأرقام
function countUp(root=document){
  if(REDUCED) return;
  root.querySelectorAll('.hero .big .num, .hero .mini b .num, .bal3 .num').forEach(el => {
    const target = Number(el.textContent.replace(/,/g,'')); if(!isFinite(target) || target === 0) return;
    const dur = 750, t0 = performance.now();
    const step = t => { const k = Math.min(1, (t - t0) / dur), v = target * (1 - Math.pow(1 - k, 3));
      el.textContent = v.toLocaleString('en-US', {maximumFractionDigits: k < 1 ? 0 : 2}); if(k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
// ترتيب ظهور العناصر
function stagger(root=document){ root.querySelectorAll('.list .item').forEach((el,i) => { if(i < 15) el.style.setProperty('--i', i); else el.style.animation = 'none'; }); }

// تحميل بشكل هيكلي بدل الدوّارة
function skeleton(kind){
  const row = `<div style="display:flex;gap:12px;align-items:center;padding:13px 4px"><div class="skel" style="width:42px;height:42px"></div><div style="flex:1"><div class="skel" style="height:14px;width:60%;margin-bottom:8px"></div><div class="skel" style="height:11px;width:40%"></div></div><div class="skel" style="width:70px;height:16px"></div></div>`;
  const top = kind==='sup' ? `<div class="card"><div class="skel" style="height:62px"></div></div><div class="skel" style="height:44px;margin-bottom:12px"></div>` : `<div class="skel" style="height:150px;margin-bottom:12px;border-radius:16px"></div>`;
  return top + `<div class="card">${row.repeat(4)}</div>`;
}

// علامة صح + احتفال بعد الحفظ
function celebrate(text, confetti=false){
  buzz(18); document.querySelectorAll('.toast').forEach(t => t.remove());
  if(REDUCED){ toast(text); return Promise.resolve(); }
  const ov = document.createElement('div'); ov.className = 'done-ov';
  ov.innerHTML = `<div class="done-box"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="45"/><path d="M30 52 l14 14 l27 -30"/></svg><b>${esc(text)}</b></div>`;
  document.body.appendChild(ov);
  if(confetti){
    const cs = getComputedStyle(document.documentElement); const colors = [cs.getPropertyValue('--accent'), cs.getPropertyValue('--brand'), cs.getPropertyValue('--brand-2'), '#ffffff', cs.getPropertyValue('--accent-soft'), cs.getPropertyValue('--green')];
    for(let i=0;i<28;i++){
      const c = document.createElement('div'); c.className = 'confetti';
      const a = Math.random()*Math.PI*2, dist = 90 + Math.random()*150;
      c.style.setProperty('--x', Math.cos(a)*dist+'px'); c.style.setProperty('--y', Math.sin(a)*dist+'px'); c.style.setProperty('--r', (Math.random()*720-360)+'deg');
      c.style.background = colors[i % colors.length]; c.style.boxShadow = '0 0 0 1px rgba(90,108,74,.15)';
      c.style.animationDelay = (Math.random()*0.12)+'s';
      document.body.appendChild(c); setTimeout(() => c.remove(), 1200);
    }
  }
  return new Promise(r => setTimeout(() => { ov.style.transition = 'opacity .2s'; ov.style.opacity = 0; setTimeout(() => { ov.remove(); r(); }, 200); }, 950));
}

// ورد متساقط في شاشة الدخول
function petals(){
  if(REDUCED) return '';
  const cols = ({rose:['#f6cfd6','#ffffff','#e2ecda','#f9dde2','#cfdcc4'], mint:['#b9ecd5','#ffffff','#9fe3c4','#e2f5ee','#cdeedd'], olive:['#e8dcc0','#ffffff','#dfe6cc','#f1e2c4','#cfd8b5']})[document.documentElement.dataset.theme] || ['#ffffff'];
  let h = '<div class="login-bg"><div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div></div><div class="petals">';
  for(let i=0;i<22;i++){
    const left = Math.random()*100, dur = 9 + Math.random()*9, delay = -Math.random()*18, size = 9 + Math.random()*9;
    h += `<span class="petal" style="left:${left}%;width:${size}px;height:${size*.7}px;background:${cols[i%cols.length]};box-shadow:0 0 0 1px rgba(106,121,85,.18);animation-duration:${dur}s;animation-delay:${delay}s;--dx:${(Math.random()*120-60)}px;--rot:${Math.random()*540-270}deg"></span>`;
  }
  return h + '</div>';
}

// اسحب لتحت للتحديث
(function(){
  let y0 = null, dy = 0, el = null;
  document.addEventListener('touchstart', e => {
    if(window.scrollY > 0 || !me || $('.sheet') || $('#mdl') || !$('header.top')) { y0 = null; return; }
    y0 = e.touches[0].clientY; dy = 0;
  }, {passive:true});
  document.addEventListener('touchmove', e => {
    if(y0 === null) return;
    dy = e.touches[0].clientY - y0; if(dy <= 0) return;
    if(!el){ el = document.createElement('div'); el.className = 'ptr'; el.innerHTML = I.refresh; document.body.appendChild(el); }
    const p = Math.min(dy, 110);
    el.style.transform = `translateY(${p - 70}px) rotate(${p*3}deg)`;
  }, {passive:true});
  document.addEventListener('touchend', async () => {
    if(!el) { y0 = null; return; }
    const ok = dy > 80, ptr = el; el = null; y0 = null;
    if(ok){ ptr.classList.add('go'); ptr.style.transform = 'translateY(10px)'; buzz(10); try{ await route(); }catch(e){} }
    ptr.style.transform = 'translateY(-70px)'; setTimeout(() => ptr.remove(), 250);
  });
})();


/* =================== أدوات الإصدار 2 =================== */
const scriptCache = {};
function loadScript(src){
  return scriptCache[src] ||= new Promise((ok, bad) => { const sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = () => bad(new Error('مش قادر أحمّل ' + src)); document.head.appendChild(sc); });
}
// حالة كل فاتورة: الدفعات المربوطة بفاتورة بتتحسب عليها، والباقي بيتوزع على الأقدم فالأحدث
function allocate(invs, pays){
  const st = new Map(invs.map(i => [i.id, {amount:Number(i.amount), paid:0}]));
  let free = 0;
  pays.filter(p => payEffect(p) > 0).forEach(p => {
    const a = payEffect(p) / 100;
    if(p.invoice_id && st.has(p.invoice_id)) st.get(p.invoice_id).paid += a; else free += a;
  });
  st.forEach(v => { if(v.paid > v.amount){ free += v.paid - v.amount; v.paid = v.amount; } });
  [...invs].sort((a,b) => a.inv_date === b.inv_date ? a.id - b.id : (a.inv_date < b.inv_date ? -1 : 1)).forEach(i => {
    const v = st.get(i.id), take = Math.min(v.amount - v.paid, free); v.paid += take; free -= take;
  });
  st.forEach(v => { v.rem = Math.max(0, Math.round((v.amount - v.paid)*100)/100); v.status = v.rem <= 0 ? 'paid' : v.paid > 0 ? 'partial' : 'unpaid'; });
  return st;
}
const soonToChecks = sm => (sm.soon || []).map(c => ({...c, check_status:'pending', method:'check', suppliers:{name:c.name}}));
const dueText = d => { const n = daysUntil(d); return n < 0 ? `فات ميعاده من ${-n} يوم` : n === 0 ? 'النهارده' : n === 1 ? 'بكرة' : `بعد ${n} يوم`; };
function dueAlert(checks){
  const due = checks.filter(c => c.check_status === 'pending' && daysUntil(c.due_date) <= 3 && chkRem(c) > 0);
  if(!due.length) return '';
  const over = due.some(c => daysUntil(c.due_date) <= 0);
  return `<div class="alert ${over?'':'soon'}" onclick="go('/checks')">
    <div class="ah">${I.bell}${over ? 'شيكات ميعادها النهارده أو فات' : 'شيكات ميعادها قرّب'} (${due.length})</div>
    ${due.slice(0,4).map(c => { const r = chkRem(c), part = r < Number(c.amount); return `<div class="ar"><span>${esc(c.suppliers?.name)} · ${dueText(c.due_date)}${part ? ' · مسدد جزئيًا' : ''}</span><b>${money(r)}${part ? `<small> باقي من ${money(c.amount)}</small>` : ''}</b></div>`; }).join('')}
  </div>`;
}
// إشعارات الشيكات (مرة واحدة في اليوم لكل شيك)
async function notifyChecks(checks){
  if(!('Notification' in window) || Notification.permission !== 'granted') return;
  const day = today();
  for(const c of checks.filter(c => c.check_status === 'pending' && daysUntil(c.due_date) <= 1 && chkRem(c) > 0)){
    const key = `ntf_${c.id}_${day}`; if(localStorage.getItem(key)) continue;
    const r = chkRem(c), part = r < Number(c.amount);
    const title = `شيك ${dueText(c.due_date)}: ${part ? 'باقي ' : ''}${r.toLocaleString('en-US')} ج${part ? ' من ' + Number(c.amount).toLocaleString('en-US') : ''}`;
    const opts = {body:`${c.suppliers?.name || ''}${c.check_no ? ' · شيك رقم ' + c.check_no : ''}`, icon:'icons/icon-192.png', badge:'icons/icon-192.png', tag:'chk'+c.id, lang:'ar', dir:'rtl'};
    try{ const reg = await navigator.serviceWorker?.getRegistration(); if(reg) await reg.showNotification(title, opts); else new Notification(title, opts); localStorage.setItem(key, '1'); }catch(e){}
  }
}
setInterval(async () => { if(sb && me){ try{ notifyChecks(soonToChecks(await api.checkSummary())); }catch(e){} } }, 30*60e3);
function download(blob, name){ const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }

/* =================== الاتصال بـ Supabase =================== */
const CFG_KEY = 'mawredin_cfg';
function readCfgFromUrl(){
  const p = new URLSearchParams(location.search);
  const c = p.get('cfg');
  if(!c) return;
  try{
    const obj = JSON.parse(decodeURIComponent(escape(atob(c))));
    if(obj.url && obj.key){ localStorage.setItem(CFG_KEY, JSON.stringify(obj)); }
  }catch(e){}
  history.replaceState(null, '', location.pathname + location.hash);
}
// أي فتح بـ http (localhost أو IP الكمبيوتر على الشبكة) = السيرفر المحلي. GitHub Pages دايمًا https
const IS_LOCAL = location.protocol === 'http:';
function getCfg(){
  // على localhost التطبيق بيتوصل تلقائيًا بالسيرفر المحلي
  if(IS_LOCAL) return {url: location.origin, key: 'local-dev'};
  // أونلاين: config.js فيه رابط ومفتاح Supabase، فأي حد يفتح الرابط يلاقيه جاهز
  const C = window.MAWREDIN_CONFIG;
  if(C && C.url && C.key && !/PUT_/.test(C.url + C.key)) return {url: C.url, key: C.key};
  try{ return JSON.parse(localStorage.getItem(CFG_KEY)); }catch(e){ return null; }
}
let lanUrls = [];
function shareLink(){
  if(IS_LOCAL) return lanUrls[0] || location.origin;
  const c = getCfg(); const b = btoa(unescape(encodeURIComponent(JSON.stringify(c))));
  return location.origin + location.pathname + '?cfg=' + b;
}

let sb = null, me = null, isOwner = false;
const urlCache = new Map();
async function signedUrl(path){
  if(!path) return null;
  const c = urlCache.get(path); if(c && c.exp > Date.now()) return c.url;
  const local = await localBlobUrl(path);              // صورة لسه على الجهاز (مترفعتش)
  if(local){ urlCache.set(path, {url:local, exp:Date.now()+50*60e3}); return local; }
  if(!navigator.onLine) return null;
  const { data, error } = await sb.storage.from('attachments').createSignedUrl(path, 3600);
  if(error) return null;
  urlCache.set(path, {url:data.signedUrl, exp:Date.now()+50*60e3});
  return data.signedUrl;
}
async function uploadImage(file, folder, opt = {}){
  const blob = await compressImage(file, opt.max || 1400, opt.q || 0.72);
  const path = `${folder}/${new Date().toISOString().slice(0,7)}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.jpg`;
  await enqueueUpload(path, blob);                      // بتتحفظ على الجهاز وتترفع لوحدها لما النت يكون موجود
  return path;
}
async function removeImage(path){ if(path) await enqueueRemove(path); }

/* =================== البيانات =================== */
async function q(promise){ const { data, error } = await promise; if(error) throw error; return data; }
// Supabase بيرجّع 1000 صف بالكتير في الطلب الواحد — فبنجيب على دفعات لحد ما نجيب كل حاجة
const PAGE = 1000;
async function fetchAll(build){
  const b0 = build(); if(b0 instanceof LQ) return q(b0);     // من الجهاز: كله مرة واحدة
  let out = [], from = 0;
  for(;;){
    const rows = await q(build().range(from, from + PAGE - 1));
    out = out.concat(rows);
    if(rows.length < PAGE) return out;
    from += PAGE;
  }
}
const api = {
  balances: () => fetchAll(() => ldb.from('supplier_balances').select('*').order('balance', {ascending:false}).order('id')),
  supplier: id => q(ldb.from('supplier_balances').select('*').eq('id', id).single()),
  suppliers: () => fetchAll(() => ldb.from('suppliers').select('id,name').order('name').order('id')),
  invoices: sid => fetchAll(() => ldb.from('invoices').select('*').eq('supplier_id', sid).order('inv_date',{ascending:false}).order('id',{ascending:false})),
  payments: sid => fetchAll(() => ldb.from('payments').select('*').eq('supplier_id', sid).order('pay_date',{ascending:false}).order('id',{ascending:false})),
  // الشيكات اللي لسه بس (للتنبيه والصفحة الرئيسية) — كلها مهما كان عددها
  checks: () => fetchAll(() => ldb.from('payments').select('*, suppliers(name)').eq('method','check').eq('check_status','pending').order('due_date').order('id')),
  // الشيكات القديمة (اتصرفت/ارتدت) صفحة صفحة
  checksPage: (status, from, n=100) => {
    let b = ldb.from('payments').select('*, suppliers(name)').eq('method','check');
    if(status !== 'all') b = b.eq('check_status', status);
    return q(b.order('due_date', {ascending:false}).order('id', {ascending:false}).range(from, from + n - 1));
  },
  members: () => q(ldb.from('members').select('*').order('created_at')),
  allSuppliers: () => fetchAll(() => ldb.from('suppliers').select('*').order('id')),
  allInvoices: () => fetchAll(() => ldb.from('invoices').select('*').order('id')),
  allPayments: () => fetchAll(() => ldb.from('payments').select('*').order('id')),
  log: async (from=0, n=200) => store.log.slice(from, from + n),
  checkSummary: () => q(ldb.rpc('checks_summary', {p_days: 3})),
  reportMonth: ym => q(ldb.rpc('report_month', {p_month: ym})),
  reportSeries: (ym, n=6) => q(ldb.rpc('report_series', {p_end: ym, p_n: n})),
};

/* =================== التوجيه =================== */
function go(h){ location.hash = h; }
window.addEventListener('hashchange', route);
let tab = {}, ledgerShown = {};  // آخر تبويب اتفتح لكل مورد

async function route(){
  closeModal();
  if(!sb) return;
  const h = location.hash.slice(1) || '/';
  const [path, qs] = h.split('?');
  const params = new URLSearchParams(qs || '');
  const parts = path.split('/').filter(Boolean);
  try{
    if(parts[0] === 's' && parts[1]) return await viewSupplier(+parts[1]);
    if(parts[0] === 'checks') return await viewChecks();
    if(parts[0] === 'backups') return await viewBackups();
    if(parts[0] === 'settings') return await viewSettings();
    if(parts[0] === 'suppliers') return await viewSuppliers();
    if(parts[0] === 'more') return viewMore();
    if(parts[0] === 'install') return viewInstall();
    if(parts[0] === 'stmt' && parts[1]) return await viewStatementIssue(+parts[1]);
    if(parts[0] === 'employees') return await viewEmployees();
    if(parts[0] === 'emp' && parts[1]) return await viewEmployee(+parts[1]);
    if(parts[0] === 'emp-edit') return await formEmployee(parts[1] ? +parts[1] : null);
    if(parts[0] === 'emp-tx') return await formEmpTx(parts[1] ? +parts[1] : null, params.get('e'));
    if(parts[0] === 'emp-set' && parts[1]) return await formSettlement(+parts[1]);
    if(parts[0] === 'emp-statement' && parts[1]) return await viewEmpStatement(+parts[1]);
    if(parts[0] === 'emp-import') return await viewEmpImport();
    if(parts[0] === 'm' && parts[1]) return viewModule(parts[1]);
    if(parts[0] === 'invoice') return await formInvoice(parts[1] ? +parts[1] : null, params.get('s'));
    if(parts[0] === 'pay') return await viewPayDetails(+parts[1]);
    if(parts[0] === 'inv') return await viewInvDetails(+parts[1]);
    if(parts[0] === 'payment') return await formPayment(parts[1] ? +parts[1] : null, params.get('s'));
    if(parts[0] === 'supplier') return await formSupplier(parts[1] ? +parts[1] : null);
    if(parts[0] === 'adjust') return await formAdjust(parts[1] ? +parts[1] : null, params.get('s'));
    if(parts[0] === 'statement' && parts[1]) return await viewStatement(+parts[1], params.get('from'), params.get('to'));
    if(parts[0] === 'reports') return await viewReports();
    if(parts[0] === 'log') return await viewLog();
    return await viewDashboard();
  }catch(e){ console.error(e); toast(errMsg(e), true); }
}

/* =================== هيكل الصفحة =================== */
let lastShown = null;
function shell({title, back, right='', body, nav=null, fabs='', home=null, page=null}){
  const app = $('#app');
  const loading = body.includes('class="skel"');
  if(loading && store.ready && hasLocalData()) return;      // البيانات على الجهاز: مفيش داعي لشاشة تحميل
  const same = !loading && lastShown === location.hash;   // نفس الصفحة (تحديث/تبويب) = من غير إعادة كل الحركات
  if(!loading) lastShown = location.hash;
  app.innerHTML = `
    ${home ? `<header class="top home-h">
      <div class="hh-logo"><img src="icons/ward.png" alt="ورد"><img src="icons/zahra.png" alt="زهرة"></div>
      <div class="hh-t"><h1><span>${title}</span><i class="hh-store">${I.store}</i></h1><small><em></em>${home.sub || 'إدارة مالية شاملة للمحل'}<em></em></small>${syncPill()}</div>
      <div class="hh-btns">
        <button class="iconbtn glass" onclick="go('/settings')" aria-label="الإعدادات">${I.gear}</button>
        <button class="iconbtn glass" onclick="go('/checks')" aria-label="الإشعارات">${I.bell}${home.alerts ? `<i class="badge">${home.alerts}</i>` : ''}</button>
      </div>
    </header>` : page ? `<header class="top page-h">
      <div class="ph-app">${I.bag}<span>حسابات المحل</span></div>
      <div class="ph-t"><h1>${page.icon ? I[page.icon] : ''}<span>${title}</span></h1><small>${page.sub || ''}</small>${syncPill()}</div>
      <div class="ph-btns">
        ${page.help ? `<button class="iconbtn" onclick="${page.help}" aria-label="مساعدة">${I.help}</button>` : ''}
        <button class="iconbtn" onclick="go('/checks')" aria-label="الإشعارات">${I.bell}${page.alerts ? `<i class="badge">${page.alerts}</i>` : ''}</button>
      </div>
    </header>` : `<header class="top">
      ${back ? `<button class="iconbtn" onclick="history.length>1?history.back():go('/')" aria-label="رجوع">${I.back}</button>` : headLogos}
      <h1>${title}</h1>${syncPill()}${right}
    </header>`}
    <main class="${same ? 'calm' : 'enter'}"${['suppliers','employees','checks','reports'].includes(nav) ? ` data-art="${nav}"` : ''}>${body}</main>
    ${fabs}
    ${nav ? `<nav class="bottom">
      <a href="#/" class="${nav==='home'?'on':''}" aria-label="الرئيسية">${I.home}<span>الرئيسية</span></a>
      <a href="#/suppliers" class="${nav==='suppliers'?'on':''}" aria-label="الموردين">${I.box}<span>الموردين</span></a>
      <a href="#/employees" class="${nav==='employees'?'on':''}" aria-label="الموظفين">${I.users}<span>الموظفين</span></a>
      <a href="#/reports" class="${nav==='reports'?'on':''}" aria-label="التقارير">${I.chart}<span>التقارير</span></a>
      <a href="#/more" class="${nav==='more'?'on':''}" aria-label="المزيد">${I.grid}<span>المزيد</span></a>
    </nav>` : ''}`;
  window.scrollTo(0,0);
  stagger(app); if(!same) countUp(app);
  if(same) app.querySelector('.fabs')?.classList.add('calm');
}
const refreshBtn = `<button class="iconbtn" onclick="route()" aria-label="تحديث">${I.refresh}</button>`;
const quickFabs = sid => `<div class="fabs">
  <button class="fab inv" onclick="go('/invoice${sid?'?s='+sid:''}')">${I.receipt}فاتورة</button>
  <button class="fab pay" onclick="go('/payment${sid?'?s='+sid:''}')">${I.cash}دفعة</button>
</div>`;

/* ---------- عرض التاريخ يوم-شهر-سنة في كل خانات التاريخ ----------
   الخانة نفسها فاضلة date عادي (عشان منتقي التاريخ بتاع الموبايل يفتح والقيمة تتحفظ yyyy-mm-dd زي ما هي)،
   وفوقها نص بيعرض التاريخ بصيغة يوم-شهر-سنة */
(() => {
  const VD = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const fmtD = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
  const enhance = el => {
    if(el._dmy) return; el._dmy = true;
    const wrap = document.createElement('span'); wrap.className = 'dmy-wrap';
    el.parentNode.insertBefore(wrap, el); wrap.appendChild(el);
    const t = document.createElement('span'); t.className = 'dmy-text'; wrap.appendChild(t);
    const upd = () => { const f = fmtD(VD.get.call(el)); t.textContent = f || 'يوم-شهر-سنة'; t.classList.toggle('ph', !f); };
    Object.defineProperty(el, 'value', {configurable:true, get(){ return VD.get.call(this); }, set(v){ VD.set.call(this, v); upd(); }});
    el.addEventListener('input', upd); el.addEventListener('change', upd);
    el.addEventListener('click', () => { try{ el.showPicker && el.showPicker(); }catch(e){} });
    upd();
  };
  const scan = root => root.querySelectorAll && root.querySelectorAll('input[type=date]').forEach(enhance);
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if(n.nodeType !== 1) return; if(n.matches('input[type=date]')) enhance(n); else scan(n); })))
    .observe(document.documentElement, {childList:true, subtree:true});
  document.addEventListener('DOMContentLoaded', () => scan(document));
  scan(document);
})();
