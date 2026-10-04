// Name rules and moderation (spec v1 §B1 acceptance).
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkName } from '../apps/worker/src/moderation.js';
import { nameFormatProblem, nameKey, suggestName } from '../packages/chez-sdk/src/names.js';
import { rng } from '../packages/rng/rng.js';

const rejected = (n) => !checkName(n).ok;

test('format rules', () => {
  for (const ok of ['Wanjiru', 'Otieno_22', 'kamau-ke', 'Zed']) assert.equal(nameFormatProblem(ok), null, ok);
  for (const bad of ['ab', 'x'.repeat(17), 'has space', 'dot.name', '_lead', 'trail-', '12345', '0712345678', 'call0722123456', 'me@mail', 'httpbob', 'www_bob', 'bobgmail']) {
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
    'mavi_mavi', 'mboooo', 'nigga', 'n1gg4', 'ass', 'a55', 'my_ass', 'sexy99', 'pussy_cat', 'dick'];
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
  for (const n of ['Wanjiru_07', 'otieno-ke', 'Kakuma254', 'Dickson_22', 'Hassan_ali', 'Titus99']) assert.ok(!rejected(n), n);
});

test('mild insults and animal nicknames are allowed but flagged', () => {
  for (const n of ['Fisi_Mkali', 'MbwaKali', 'Nyani22', 'stupid_dog', 'Mjinga']) {
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
