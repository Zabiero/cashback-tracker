import type { Category, PaymentMethod } from '../engine/types';

export interface CatalogScenario {
  productId: string;
  description: string;
  period: { start: string; end: string };
  transactions: { date: string; amount: number; category: Category; paymentMethod: PaymentMethod; merchant?: string; overseas?: boolean }[];
  expectedRM: number;
  source: string; // URL + clause/example the expected value comes from
}

const MAYBANK_TNC = 'https://www.maybank2u.com.my/iwov-resources/pdf/personal/cards/credit_cards/tc-amex-ikhwan-cashback.pdf';
const RHB_TNC = 'https://www.rhbgroup.com/-/media/Files/personal/cards/credit-cards/overview/RHB-Shell-Visa-Credit-Card_Terms.pdf';
const UOB_TNC = 'https://www.uob.com.my/assets/web-resources/personal/pdf/cards/credit-cards/one-card/one-card-tnc-eng.pdf';
const ALLIANCE_TNC = 'https://www.alliancebank.com.my/Alliance/media/Documents/Cards/Personal/Credit-Cards/Credit-Card-Terms-Conditions-TNC-EN.pdf';
const PBB_PAGE = 'https://www.pbebank.com/en/cards/our-cards/pb-quantum-credit-cards-2/';
const AEON_PAGE = 'https://myaeoncredit.com.my/aeon-cards/aeon-member-plus-visa-platinum-credit-card/';

export const SCENARIOS: CatalogScenario[] = [
  {
    productId: 'maybank-islamic-ikhwan-amex-platinum',
    description: 'Online spend hits the RM50 monthly cap; offline spend earns TreatsPoints',
    period: { start: '2026-09-01', end: '2026-09-30' },
    transactions: [
      { date: '2026-09-03', amount: 500, category: 'online', paymentMethod: 'online', merchant: 'Shopee' },
      { date: '2026-09-10', amount: 300, category: 'others', paymentMethod: 'online', merchant: 'Zalora' },
      { date: '2026-09-12', amount: 100, category: 'dining', paymentMethod: 'physical', merchant: 'Kopitiam' },
      { date: '2026-09-15', amount: 100, category: 'petrol', paymentMethod: 'physical', merchant: 'Petronas' },
    ],
    expectedRM: 50.6, // 40 + min(24, 10 left) = 50 cashback; 200 + 100 TreatsPoints × RM0.002 = 0.60
    source: `${MAYBANK_TNC}: clause 1 (8% online), clause 3a (RM50/month cap), clause 6 (calendar month); TreatsPoints 2x/1x from the maybank2u product page; 500 TreatsPoints = RM1 from https://www.maybank2u.com.my/maybank2u/malaysia/en/personal/cards/treats_rewards/treatspoints-redeem.page`,
  },
  {
    productId: 'rhb-shell-visa',
    description: 'RM2,200 cycle (Tier 2): groceries below the RM250 category minimum earn nothing, utilities above it earn 2%',
    period: { start: '2026-09-01', end: '2026-09-30' },
    transactions: [
      { date: '2026-09-02', amount: 300, category: 'petrol', paymentMethod: 'physical', merchant: 'Shell Jalan Ampang' },
      { date: '2026-09-05', amount: 200, category: 'groceries', paymentMethod: 'physical', merchant: 'Lotus' },
      { date: '2026-09-08', amount: 300, category: 'utilities', paymentMethod: 'online', merchant: 'TNB' },
      { date: '2026-09-20', amount: 1400, category: 'others', paymentMethod: 'physical', merchant: 'IKEA' },
    ],
    expectedRM: 23.8, // Shell 300 × 5% = 15; groceries 0 (< RM250); utilities 300 × 2% = 6; others 1400 × 0.2% = 2.80
    source: `${RHB_TNC}: Table 1 (Tier 2 RM2,000–2,999.99: Shell 5%, utilities 2%, others 0.2%; minimum spend per category RM250 grocery/utilities, RM500 others)`,
  },
  {
    productId: 'uob-one-classic',
    description: 'RM900 statement month meets RM800 minimum: 10% categories hit RM10 caps, other retail 0.2%',
    period: { start: '2026-08-08', end: '2026-09-07' },
    transactions: [
      { date: '2026-08-10', amount: 200, category: 'petrol', paymentMethod: 'physical', merchant: 'Petronas' },
      { date: '2026-08-12', amount: 150, category: 'dining', paymentMethod: 'contactless', merchant: 'Nasi Kandar' },
      { date: '2026-08-20', amount: 300, category: 'groceries', paymentMethod: 'physical', merchant: 'Jaya Grocer' },
      { date: '2026-09-01', amount: 250, category: 'others', paymentMethod: 'physical', merchant: 'Uniqlo' },
    ],
    expectedRM: 30.5, // 10 + 10 + 10 (each 10% capped at RM10) + 250 × 0.2%
    source: `${UOB_TNC}: clause 1(b) Table 2 (ONE Classic): 10% at Minimum Retail Spend ≥ RM800, RM10 cap per rebate category; Other Retail 0.2% unlimited`,
  },
  {
    productId: 'uob-one-classic',
    description: 'RM500 statement month below RM800 minimum: everything earns 0.2%',
    period: { start: '2026-08-08', end: '2026-09-07' },
    transactions: [
      { date: '2026-08-10', amount: 200, category: 'petrol', paymentMethod: 'physical', merchant: 'Shell' },
      { date: '2026-08-15', amount: 300, category: 'others', paymentMethod: 'online', merchant: 'Shopee' },
    ],
    expectedRM: 1.0, // 500 × 0.2%
    source: `${UOB_TNC}: clause 1(b) Table 2 (ONE Classic): 0.2% for all categories when Minimum Retail Spend is RM0–RM799`,
  },
  {
    productId: 'uob-one-classic',
    description: 'Utility bills do not count toward the RM800 minimum: RM700 retail + RM300 utilities stays at 0.2%',
    period: { start: '2026-08-08', end: '2026-09-07' },
    transactions: [
      { date: '2026-08-10', amount: 200, category: 'petrol', paymentMethod: 'physical', merchant: 'Petronas' },
      { date: '2026-08-15', amount: 500, category: 'others', paymentMethod: 'physical', merchant: 'Uniqlo' },
      { date: '2026-08-18', amount: 300, category: 'utilities', paymentMethod: 'online', merchant: 'TNB' },
    ],
    expectedRM: 1.4, // tier spend 700 < 800 → 700 × 0.2%; utilities earn nothing
    source: `${UOB_TNC}: clause 3 excludes "Government transactions including utility bills" from Minimum Retail Spend; Table 2 0.2% below RM800`,
  },
  {
    productId: 'alliance-visa-infinite',
    description: 'Overseas dining earns 10x, domestic groceries 1x, petrol nothing',
    period: { start: '2026-09-01', end: '2026-09-30' },
    transactions: [
      { date: '2026-09-05', amount: 1000, category: 'dining', paymentMethod: 'physical', merchant: 'Tokyo restaurant', overseas: true },
      { date: '2026-09-10', amount: 600, category: 'groceries', paymentMethod: 'physical', merchant: 'Village Grocer' },
      { date: '2026-09-12', amount: 200, category: 'petrol', paymentMethod: 'physical', merchant: 'Petron' },
    ],
    expectedRM: 17.67, // (10,000 + 600) TBP ÷ 600 per RM1 = 17.67
    source: `${ALLIANCE_TNC}: "Visa Infinite | 10x TBP | Overseas; 1x TBP | Domestic"; TBP not awarded at petrol stations; 60,000 TBP = RM100 (https://www.alliancebank.com.my/rewards)`,
  },
  {
    productId: 'alliance-visa-virtual',
    description: 'eCommerce + eWallet beyond RM3,000 in a cycle overflows to 1x',
    period: { start: '2026-09-01', end: '2026-09-30' },
    transactions: [
      { date: '2026-09-03', amount: 2500, category: 'online', paymentMethod: 'online', merchant: 'Lazada' },
      { date: '2026-09-08', amount: 1000, category: 'ewallet', paymentMethod: 'ewallet_reload', merchant: 'Touch n Go' },
      { date: '2026-09-15', amount: 300, category: 'others', paymentMethod: 'physical', merchant: 'Popular' },
    ],
    expectedRM: 41.33, // 2,500 × 8 + 500 × 8 + 500 × 1 + 300 × 1 = 24,800 TBP ÷ 600 = 41.33
    source: `${ALLIANCE_TNC}: Visa Virtual 8x eCommerce and eWallet top-up, footnotes 1–2 "any spend amount above RM3,000 on each statement cycle, you will earn 1X TBP"; 1x other domestic retail`,
  },
  {
    productId: 'pbb-quantum-visa',
    description: 'Contactless ≥ RM100 earns 1%; smaller contactless and online spend earn VIP Points',
    period: { start: '2026-09-01', end: '2026-09-30' },
    transactions: [
      { date: '2026-09-04', amount: 150, category: 'groceries', paymentMethod: 'contactless', merchant: 'Giant' },
      { date: '2026-09-06', amount: 80, category: 'dining', paymentMethod: 'contactless', merchant: 'Sushi King' },
      { date: '2026-09-09', amount: 200, category: 'online', paymentMethod: 'online', merchant: 'Shopee' },
    ],
    expectedRM: 2.06, // 150 × 1% = 1.50; (80 + 200) VIP Points × RM0.002 (estimate) = 0.56
    source: `${PBB_PAGE}: "1% Cash Back on contactless transactions with minimum RM100 per transaction, capped at RM20 per monthly statement cycle"; "1x VIP Point for other retail spend (local)"`,
  },
  {
    productId: 'pbb-quantum-mastercard',
    description: 'Overseas ≥ RM100 earns 2% up to RM20; overseas < RM100 earns nothing; local spend earns VIP Points',
    period: { start: '2026-09-01', end: '2026-09-30' },
    transactions: [
      { date: '2026-09-04', amount: 500, category: 'travel', paymentMethod: 'physical', merchant: 'Hotel Bangkok', overseas: true },
      { date: '2026-09-05', amount: 800, category: 'others', paymentMethod: 'physical', merchant: 'Siam Paragon', overseas: true },
      { date: '2026-09-06', amount: 50, category: 'dining', paymentMethod: 'physical', merchant: 'Street food', overseas: true },
      { date: '2026-09-12', amount: 300, category: 'groceries', paymentMethod: 'physical', merchant: 'Mydin' },
    ],
    expectedRM: 20.6, // 10 + min(16, 10 left) = 20; 300 VIP Points × RM0.002 (estimate) = 0.60
    source: `${PBB_PAGE}: "2% Cash Back on overseas transactions with minimum RM100 per transaction, capped at RM20 per monthly statement cycle"; "1x VIP Point for other retail spend (local)"`,
  },
  {
    productId: 'aeon-amp-visa-platinum',
    description: 'AEON Thank You Day (20th and 28th) 10% hits the RM100 cap; online 2% hits RM25; other days earn points',
    period: { start: '2026-09-01', end: '2026-09-30' },
    transactions: [
      { date: '2026-09-10', amount: 200, category: 'groceries', paymentMethod: 'physical', merchant: 'AEON Mall Mid Valley' },
      { date: '2026-09-14', amount: 1500, category: 'online', paymentMethod: 'online', merchant: 'Lazada' },
      { date: '2026-09-18', amount: 100, category: 'others', paymentMethod: 'physical', merchant: 'Watsons' },
      { date: '2026-09-20', amount: 500, category: 'groceries', paymentMethod: 'physical', merchant: 'AEON BiG' },
      { date: '2026-09-28', amount: 800, category: 'others', paymentMethod: 'physical', merchant: 'AEON Bukit Tinggi' },
    ],
    expectedRM: 127.5, // AEON 10th: 400 pts = 2.00; online min(30, 25) = 25; Watsons 100 pts = 0.50; 20th 50 + 28th min(80, 50 left) = 100
    source: `${AEON_PAGE}: "10% Cashback on AEON Thank You Day ... 20th & 28th ... capped at RM100", "2% Cashback on Online Spending ... Capped at RM25", "4X AEON Points at every RM2 spent at AEON Stores", "1X AEON Point for every RM1", "200 AEON Points = RM1"`,
  },
];
