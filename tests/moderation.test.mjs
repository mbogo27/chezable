// Name rules and moderation (spec v1 §B1 acceptance).
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkName } from '../apps/worker/src/moderation.js';
import { nameFormatProblem, nameKey, suggestName } from '../packages/chez-sdk/src/names.js';
import { rng } from '../packages/rng/rng.js';

const rejected = (n) => !checkName(n).ok;

test('format rules', () => {
  for (const ok of ['Wanjiru', 'Otieno_22', 'kamau_ke', 'Zed']) assert.equal(nameFormatProblem(ok), null, ok);
  for (const bad of ['ab', 'x'.repeat(17), 'has space', 'dot.name', 'kamau-ke', '_lead', 'trail-', '12345', '0712345678', 'call0722123456', 'me@mail', 'httpbob', 'www_bob', 'bobgmail']) {
    assert.notEqual(nameFormatProblem(bad), null, bad);
  }
});

test('reserved names and lookalikes', () => {
  for (const n of ['Chezable', 'ch3zable', 'CHEZABLE_ke', 'admin', 'Adm1n_1', 'the_mod', 'Support', 'official_x', 'staff', 'team_k', 'xchezablex']) assert.ok(rejected(n), n);
  for (const n of ['Modern', 'Teamwork22', 'Admiral']) assert.ok(!rejected(n), n);
});

test('uniqueness key folds case and lookalikes', () => {
  assert.equal(nameKey('Wanjiru'), nameKey('wanjiru'));
  assert.equal(nameKey('W4njiru'), nameKey('wanjiru'));
  assert.equal(nameKey('wan_jiru'), nameKey('wanjiru'));
  assert.notEqual(nameKey('Wanjiru'), nameKey('Wambui'));
});

test('evasions are caught: leetspeak, repeats, separators, zero-width characters', () => {
  const evasions = ['fuck', 'FUCK', 'fu_ck', 'phuck_fuuuck', 'f4ggot', 'b1tch', 'biiitch', 'sh1t', 's_h_i_t', 'k_u_m_a', 'k-u-m-a',
    'kuuuma', 'KUMA', 'ku​ma', 'f​u​ck', 'kahaba', 'k4h4b4', 'kumamako', 'kuma_mako', 'msenge', 'm5enge',
    'mavi_mavi', 'mboooo', 'kkk', 'KKK_22', 'nigga', 'n1gg4', 'ass', 'a55', 'my_ass', 'sexy99', 'pussy_cat', 'dick'];
  for (const n of evasions) assert.ok(rejected(n), `should reject ${JSON.stringify(n)}`);
});

test('whitelist corpus: real Kenyan names and places pass with zero false rejections', () => {
  const corpus = `Wanjiru Otieno Kamau Achieng Njoroge Kipchoge Wekesa Wafula Barasa Simiyu Nasimiyu Wanjala Kipkemboi Kiprotich Chebet
    Jepkosgei Cherono Njeri Wambui Nyambura Wairimu Atieno Akinyi Odhiambo Ochieng Omondi Onyango Mutua Mwende Kioko Mutiso Wanjiku
    Kariuki Githinji Mugo Kimani Mwangi Maina Ndungu Gitau Muthoni Hassan Ali Fatuma Mohamed Abdi Amina Halima Ahmed Omar Juma Baraka
    Zawadi Neema Imani Furaha Tumaini Nasra Saida Shitanda Shikuku Shiundu Dickson Titus Mbogo Mbotela Kimbo Ombok Assumpta Cassandra
    Kakuma Kakamega Kisumu Mombasa Malindi Ukunda Matuu Kitui Sagana Nanyuki Kikuyu Limuru Kiambu Muranga Kerugoya Kutus Mwingi Mumias
    Butere Kimilili Webuye Shinyalu Ikolomani Bumula Mbale Vihiga Luanda Maseno Bondo Siaya Ugunja Ahero Awasi Muhoroni Kendu Oyugis
    Rongo Kehancha Isebania Keroka Nyansiongo Kilgoris Lolgorian Suswa Gilgil Molo Njoro Elburgon Londiani Kapsabet Nandi Iten Kabarnet
    Marigat Kapenguria Makutano Lodwar Lokichoggio Moyale Sololo Merti Hola Garsen Kipini Witu Mpeketoni Faza Pate Kiunga Mtito Taveta
    Wundanyi Mwatate Bura Kinango Msambweni Shimoni Diani Tiwi Shanzu Bamburi Kongowea Likoni Changamwe Mikindani Jomvu Mariakani
    Kaloleni Rabai Mazeras Kikambala Kilifi Takaungu Gede Watamu Nairobi Kibera Kawangware Kasarani Embakasi Ruaka Rongai Ngong
    Kitengela Athi Machakos Makueni Wote Kajiado Narok Bomet Kericho Sotik Litein Nyamira Kisii Migori Homabay Mbita Busia Bungoma
    Eldoret Turbo Burnt Kitale Nakuru Naivasha Nyahururu Nyeri Karatina Othaya Embu Meru Chuka Isiolo Marsabit Wajir Garissa Mandera
    Lamu Voi Wote Thika Ruiru Juja Kahawa Githurai Zimmerman Kayole Umoja Donholm Buruburu Makadara Mathare Korogocho Dandora
    Sussex Essex Scunthorpe Hancock Peacock Grapefruit Cucumber Document Therapist Mfalme Simba Twiga Ndovu Chui Kifaru`.split(/\s+/).filter(Boolean);
  const wrong = corpus.filter((n) => rejected(n));
  assert.deepEqual(wrong, [], 'false rejections');
  // with numbers and separators, as players actually type them
  for (const n of ['Wanjiru_K', 'Bob_K', 'Wanjiru_07', 'otieno_ke', 'Kakuma254', 'Dickson_22', 'Hassan_ali', 'Titus99']) assert.ok(!rejected(n), n);
});

test('Swahili blocklist (docs/swahili_profanity_blocklist_and_moderation_strategy.md)', () => {
  // strict roots, anywhere, with conjugations and leetspeak
  for (const n of ['t0mb4', 'kutomba', 'nitakutomba', 'tombwa_22', 'd1ny4', 'dinywa', 'ms3ng3', 'xMalayax', 'k4h4b4', 'pumb4vu_ke',
    'mpuuz1', 'mburulaa', 'kuma_ya_mama', 'kuma_mama', 'kuma_yako', 'toooomba']) assert.ok(rejected(n), `should reject ${n}`);
  // whole-word terms, including camelCase word breaks
  for (const n of ['kuma', 'quma', 'mb00', 'Shoga_22', 'b4sh4', 'mj1ng4', 'jinga', 'zuzu', 'm4t4k0', 'tako', 'ny0ny0s', 'f1s1',
    'ny4n1', 'mbw4', 'MbwaKali', 'Fisi_Mkali', 'k4f1r1', 'mch4w1', 'NyaniBoy']) assert.ok(rejected(n), `should reject ${n}`);
  // look-alikes the doc warns about
  for (const n of ['Kumasi', 'Akuma', 'Kumamoto', 'Mbooni', 'Mbwana', 'Mbwana_22', 'Jinja', 'Himalaya', 'Malayalam', 'Kakuma',
    'Tom_Baraka', 'TomBarasa', 'Tom_Bakari', 'Tombe', 'Odinga']) assert.ok(!rejected(n), `should allow ${n}`);
  assert.ok(checkName('Tom_Baraka').flagged, 'Tom + Ba... names go to review');
  assert.ok(rejected('tom_ba') && rejected('Tom_bana'), 'but not short evasions');
});

test('mild insults and animal nicknames are allowed but flagged', () => {
  for (const n of ['stupid_dog', 'Punda22', 'Kichaa_K', 'mbwakali']) {
    const r = checkName(n);
    assert.ok(r.ok && r.flagged, n);
  }
  assert.equal(checkName('Wanjiru').flagged, false);
});

test('Suggest one never produces a rejected or flagged name', () => {
  const r = rng('suggest-test');
  for (let i = 0; i < 5000; i++) {
    const n = suggestName(r);
    const c = checkName(n);
    assert.ok(c.ok && !c.flagged, n);
  }
});
