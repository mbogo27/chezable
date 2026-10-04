// About, privacy and terms (spec §12.3, launch checklist item 9). Plain language.
// These are drafts written to the spec's compliance flags, not legal advice: have a Kenyan lawyer review them.
const PAGES = {
  about: {
    en: `<h1 class="page-title">About Chezable</h1>
      <p><b>Cheza</b> means <i>to play</i>. Chezable makes short games you can play alone or head to head, and share in a tap.</p>
      <p>Every game is a <i>stage</i> inside one shell. Your name, level, XP and coins follow you from stage to stage. Send a challenge link and a friend plays the exact same board you did.</p>
      <h2>Chezability</h2>
      <p>Each game also has a <b>Native mode</b> built from a real Kenyan or East African game: kati, Kiothi, Giuthi, Shisima, Igisoro and Kadi. We are testing, in public, whether native mechanics make better games than borrowed ones. The plan was written and dated before launch, and we will publish the result either way.</p>
      <p>Each game's "How it's made" card shows the design notation behind it.</p>`,
  },
  privacy: {
    en: `<h1 class="page-title">Privacy notice</h1>
      <p class="muted">Last updated 4 October 2026. Draft for legal review under Kenya's Data Protection Act, 2019.</p>
      <h2>What we collect</h2>
      <ul>
        <li><b>A random player ID</b> made on your phone the first time you open Chezable, and a secret that proves requests come from your phone.</li>
        <li><b>The name you choose</b>, if you claim one. It is public on standings and challenges.</li>
        <li><b>Gameplay data</b>: games played, scores, times, the inputs that produced a score, challenges, and simple usage events (for example "opened a game", "shared a result").</li>
      </ul>
      <h2>What we don't collect</h2>
      <p>No phone number, email, real name, age, contacts, photos or precise location. No advertising. There is no chat.</p>
      <h2>Google Analytics</h2>
      <p>We use Google Analytics to count visits and see which pages and games are used. It sets cookies and sends Google technical details such as your browser, device type, approximate region and the pages you open. We don't send Google your player name, scores or player ID. Google's privacy policy applies to that data (policies.google.com/privacy). You can block it with your browser's privacy settings or a tracker blocker, and the games keep working.</p>
      <h2>Why</h2>
      <p>To run the games, keep standings fair, link challenges between friends, and learn which games people enjoy (including the Classic vs Native experiment described on the About page). Usage events carry no personal details and their session IDs change every day.</p>
      <h2>Where it lives</h2>
      <p>On Cloudflare's network (Cloudflare Workers and D1). Your phone also keeps a copy in its local storage.</p>
      <h2>Your choices</h2>
      <p>You can export your data from your profile, change your name, or stop playing at any time. To delete your player record, contact us with your player name and recovery code and we will remove it within 30 days.</p>
      <h2>Children</h2>
      <p>Many players are under 18. That is why we collect so little and why every name passes a filter.</p>
      <h2>Contact</h2>
      <p>privacy@chezable.com</p>`,
  },
  terms: {
    en: `<h1 class="page-title">Terms</h1>
      <p class="muted">Last updated 3 October 2026. Draft for legal review.</p>
      <h2>Playing</h2>
      <p>Chezable is free to play. Be kind: names that insult, impersonate or contain contact details will be removed.</p>
      <h2>Coins</h2>
      <p><b>Coins are earned by playing and nothing else.</b> They cannot be bought, sold, transferred, or exchanged for money, airtime, goods or prizes. They have no cash value. We may change how coins are earned, or what they unlock, at any time.</p>
      <h2>Fair play</h2>
      <p>Scores that break the rules of a game, or come from modified clients, can be removed from standings.</p>
      <h2>No prizes</h2>
      <p>There are no cash prizes, betting or paid entries on Chezable.</p>
      <h2>Changes</h2>
      <p>We may update these terms; the date above will change when we do.</p>`,
  },
};

export function renderStatic(page) {
  const p = PAGES[page];
  return `<article class="prose">${(p && p.en) || ''}</article>`;
}
