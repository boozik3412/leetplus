// Self-hosted fonts are SIL OFL 1.1 (Unbounded, Manrope); see public/landing/fonts/OFL.txt.
export const landingCss = `
@font-face{font-family:"LP Manrope";font-style:normal;font-weight:400 800;font-display:swap;src:url("/landing/fonts/manrope-cyrillic.woff2") format("woff2");unicode-range:U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116}
@font-face{font-family:"LP Manrope";font-style:normal;font-weight:400 800;font-display:swap;src:url("/landing/fonts/manrope-latin.woff2") format("woff2");unicode-range:U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD}
@font-face{font-family:"LP Unbounded";font-style:normal;font-weight:700 800;font-display:swap;src:url("/landing/fonts/unbounded-cyrillic.woff2") format("woff2");unicode-range:U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116}
@font-face{font-family:"LP Unbounded";font-style:normal;font-weight:700 800;font-display:swap;src:url("/landing/fonts/unbounded-latin.woff2") format("woff2");unicode-range:U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD}
.lpl{--lpl-display:"LP Unbounded",Arial,sans-serif;--lpl-text:"LP Manrope",Arial,sans-serif;background:#050B10;color:#F3FAFA;font-family:var(--lpl-text);font-size:17px;line-height:1.55;overflow-x:hidden;min-height:100vh}
.lpl *,.lpl *::before,.lpl *::after{box-sizing:border-box}
html:has(.lpl){scroll-behavior:smooth;background:#050B10;color-scheme:dark}
.lpl a{color:#83E4EC;text-decoration:none}
.lpl a:hover{color:#B8F1F5}
.lpl .lp-nav{display:flex}
@media (max-width: 960px){.lpl .lp-nav{display:none}}
.lpl .lp-btn{transition:transform .2s ease, box-shadow .2s ease}
.lpl .lp-btn:hover{transform:translateY(-2px);box-shadow:0 12px 40px rgba(131,228,236,.45)}
.lpl .lp-ghost{transition:background .2s ease}
.lpl .lp-ghost:hover{background:rgba(131,228,236,.08)}
.lpl input::placeholder{color:#6F8A93}
.lpl input:focus{outline:2px solid #83E4EC;outline-offset:2px}
.lpl a:focus-visible,.lpl button:focus-visible,.lpl summary:focus-visible{outline:2px solid #83E4EC;outline-offset:3px}
.lpl .bg-hero{background-image:linear-gradient(90deg,rgba(5,11,16,.96) 0%,rgba(5,11,16,.82) 45%,rgba(5,11,16,.55) 100%),url(/landing/hero.webp);background-size:cover;background-position:center}
.lpl .bg-owner{background-image:linear-gradient(180deg,rgba(5,11,16,.92) 0%,rgba(5,11,16,.66) 45%,rgba(5,11,16,.95) 100%),url(/landing/owner-club.webp);background-size:cover;background-position:center 45%}
.lpl .bg-builder{background-image:linear-gradient(180deg,rgba(5,11,16,.9),rgba(5,11,16,.93)),url(/landing/builder.webp);background-size:cover;background-position:center}
.lpl .ph-thrill{background-image:linear-gradient(180deg,rgba(5,11,16,0) 30%,rgba(5,11,16,.95) 100%),url(/landing/card-thrill.webp);background-size:cover;background-position:60% center}
.lpl .ph-progress{background-image:linear-gradient(180deg,rgba(5,11,16,0) 30%,rgba(5,11,16,.95) 100%),url(/landing/hero.webp);background-size:cover;background-position:75% center}
.lpl .ph-rival{background-image:linear-gradient(180deg,rgba(5,11,16,.05) 30%,rgba(5,11,16,.95) 100%),url(/landing/card-rival.webp);background-size:cover;background-position:35% center}
.lpl .emo{container-type:inline-size}
.lpl .emo-title{font-size:min(44px,9.4cqi) !important}
.lpl .case-hop{transition:transform .25s ease}
.lpl .case-wrap:hover .case-hop{animation:lpl-hop .6s ease-in-out infinite}
@keyframes lpl-hop{0%,100%{transform:translateY(0) rotate(0)}30%{transform:translateY(-18px) rotate(-3deg)}55%{transform:translateY(0) rotate(2deg)}75%{transform:translateY(-6px)}}
.lpl .case-wrap:hover .case-glow{opacity:1}
.lpl .case-glow{opacity:.45;transition:opacity .3s ease}
.lpl .seg{font:inherit;font-size:15px;font-weight:700;border:none;cursor:pointer;padding:10px 18px;border-radius:999px;transition:background .2s ease,color .2s ease}
.lpl .plan{transition:transform .25s ease,border-color .25s ease}
.lpl .plan:hover{transform:translateY(-4px);border-color:#2A5A62 !important}
.lpl .guest-cta{transition:transform .2s ease,box-shadow .2s ease}
.lpl .guest-cta:hover{transform:translateY(-1px);box-shadow:0 8px 28px rgba(208,170,108,.45)}
.lpl .emo{transition:transform .35s ease, box-shadow .35s ease}
.lpl .emo:hover{transform:translateY(-6px);box-shadow:0 30px 60px rgba(0,0,0,.5)}
.lpl .grid-floor{position:absolute;left:-50%;right:-50%;bottom:-20%;height:60%;background-image:linear-gradient(rgba(131,228,236,.14) 1px,transparent 1px),linear-gradient(90deg,rgba(131,228,236,.14) 1px,transparent 1px);background-size:64px 64px;transform:perspective(600px) rotateX(64deg);-webkit-mask-image:linear-gradient(to top,#000 10%,transparent 85%);mask-image:linear-gradient(to top,#000 10%,transparent 85%);animation:lpl-gridmove 2.4s linear infinite;pointer-events:none}
@keyframes lpl-gridmove{from{background-position:0 0}to{background-position:0 64px}}
.lpl .float-a{animation:lpl-floaty 6s ease-in-out infinite}
.lpl .float-b{animation:lpl-floaty 7s ease-in-out -2s infinite}
.lpl .float-c{animation:lpl-floaty 5.5s ease-in-out -1s infinite}
.lpl .float-d{animation:lpl-floaty 6.5s ease-in-out -3s infinite}
@keyframes lpl-floaty{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-16px) rotate(2deg)}}
.lpl .glow-pulse{animation:lpl-glowp 3s ease-in-out infinite}
@keyframes lpl-glowp{0%,100%{opacity:.55;transform:scale(.95)}50%{opacity:1;transform:scale(1.08)}}
.lpl .shine{background:linear-gradient(90deg,#83E4EC 0%,#E8FCFF 25%,#83E4EC 50%,#D0AA6C 75%,#83E4EC 100%);background-size:200% auto;-webkit-background-clip:text;background-clip:text;color:transparent;animation:lpl-shine 6s linear infinite}
@keyframes lpl-shine{to{background-position:200% center}}
.lpl .marquee{display:flex;width:max-content;animation:lpl-marquee 28s linear infinite}
@keyframes lpl-marquee{to{transform:translateX(-50%)}}
.lpl .toast-in{animation:lpl-toastin 9s ease-in-out infinite}
.lpl .toast-in2{animation:lpl-toastin 9s ease-in-out -4.5s infinite}
@keyframes lpl-toastin{0%,8%{opacity:0;transform:translateY(14px)}14%,44%{opacity:1;transform:translateY(0)}52%,100%{opacity:0;transform:translateY(-10px)}}
.lpl .bar-grow{transform-origin:left;animation:lpl-grow 2.6s cubic-bezier(.2,.8,.2,1) both}
.lpl .bar-grow2{transform-origin:left;animation:lpl-grow 2.6s cubic-bezier(.2,.8,.2,1) .3s both}
@keyframes lpl-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.lpl .typing span{display:inline-block;width:7px;height:7px;border-radius:50%;background:#83E4EC;margin-right:4px;animation:lpl-dot 1.2s ease-in-out infinite}
.lpl .typing span:nth-child(2){animation-delay:.15s}
.lpl .typing span:nth-child(3){animation-delay:.3s}
@keyframes lpl-dot{0%,100%{opacity:.25;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}
.lpl .pulse-dot{animation:lpl-pdot 1.6s ease-in-out infinite}
@keyframes lpl-pdot{0%,100%{box-shadow:0 0 0 0 rgba(131,228,236,.6)}50%{box-shadow:0 0 0 8px rgba(131,228,236,0)}}
@media (prefers-reduced-motion: reduce){.lpl *,.lpl *::before,.lpl *::after{animation:none !important;transition:none !important}}
@media (max-width: 600px){.lpl .hide-sm{display:none !important}}
`;
