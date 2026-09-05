import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local', override: true });

async function main() {
  console.log('Syncing updated serviceNotice to Google Sheets & Redis Cache...');

  const { writeSettings } = await import('../src/lib/sheets/crud');
  const { bustMenuCache, getCatalog } = await import('../src/lib/menu-cache');

  const noticeTh = [
    'ครัวเปิด 10:00-20:00 น. · รับออเดอร์ถึง 20:00 น.',
    'ยอดสั่งขั้นต่ำ 500 บาทต่อการจัดส่ง (ไม่นับอาหารเช้าแบบเซต หมูหัน และเครื่องดื่ม)',
    'ระยะเวลาจัดส่งประมาณ 1 ชั่วโมง ขึ้นอยู่กับคิวอาหารและระยะทาง',
    'อาหารเช้า สั่งล่วงหน้าไม่เกิน 17:00 น. ของวันก่อน ขั้นต่ำ 16 ท่าน ส่งถึงไม่เกิน 07:30 น. · เก็บยอดก่อนเพื่อยืนยันออเดอร์',
    'เครื่องดื่ม น้ำแข็ง ถ่านปิ้งย่าง กรุณาสั่งก่อน 17:00 น.',
    'กิจกรรมทางน้ำ ขั้นต่ำ 1 ชั่วโมงต่อกิจกรรม รอบสุดท้าย 18:00 น. มัดจำ 50% ของราคากิจกรรม ทีมงานใช้เวลาเดินทางถึงบ้านพักประมาณ 30 นาที กรุณาเผื่อเวลาจองล่วงหน้า',
    'สอบถามเพิ่มเติม โทร 095-151-9501',
  ].join('\n');

  const noticeEn = [
    'Kitchen open 10:00-20:00; orders accepted until 20:00.',
    'Minimum 500 THB per delivery (breakfast sets, roast suckling pig and drinks are not counted).',
    'Delivery takes about 1 hour, depending on the kitchen queue and distance.',
    'Breakfast must be ordered by 17:00 the day before, minimum 16 guests, delivered by 07:30, paid upfront to confirm.',
    'Drinks, ice and barbecue charcoal must be ordered before 17:00.',
    'Water activities: minimum 1 hour each, last session 18:00, 50% deposit required (our team needs about 30 minutes to reach the villa — please book ahead).',
    'Questions: call 095-151-9501.',
  ].join('\n');

  const noticeZh = [
    '厨房营业 10:00-20:00，接单至 20:00。',
    '每次配送最低消费 500 泰铢（不含早餐套餐、烤乳猪与饮料）。',
    '配送约需 1 小时，视厨房排队与路程而定。',
    '早餐需于前一天 17:00 前预订，最少 16 位，07:30 前送达，需先付款确认。',
    '饮料、冰块与烧烤木炭请于 17:00 前订购。',
    '水上活动每项最少 1 小时，最后一场 18:00，需付 50% 订金（工作人员前往别墅约需 30 分钟，请提前预订）。',
    '咨询请拨 095-151-9501。',
  ].join('\n');

  try {
    await writeSettings([
      { key: 'service_notice_th', value: noticeTh },
      { key: 'service_notice_en', value: noticeEn },
      { key: 'service_notice_zh', value: noticeZh },
    ]);
    console.log('✅ Google Sheets Settings updated successfully.');
  } catch (err) {
    console.error('⚠️ Could not write to Google Sheets:', err);
  }

  const newVersion = await bustMenuCache();
  console.log(`✅ Menu cache busted in Redis. New version: ${newVersion}`);

  const freshCatalog = await getCatalog();
  console.log('\n--- Verified Fresh Notice (TH) from getCatalog() ---');
  console.log(freshCatalog.settings.serviceNotice.th);
}

main().catch(console.error);

