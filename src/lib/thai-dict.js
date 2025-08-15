export const THAI_SEED = {
  "vegetable": "ผัก",
  "very": "มาก",
  "west": "ตะวันตก",
  "apple": "แอปเปิล",
  "egg": "ไข่",
  "market": "ตลาด",
  "rice": "ข้าว",
  "chicken": "ไก่",
  "fish": "ปลา",
  "bread": "ขนมปัง",
  "water": "น้ำ",
  "milk": "นม",
  "coffee": "กาแฟ",
  "tea": "ชา",
  "hello": "สวัสดี",
  "goodbye": "ลาก่อน",
  "please": "กรุณา",
  "thank you": "ขอบคุณ",
  "bathroom": "ห้องน้ำ",
  "money": "เงิน",
  "train": "รถไฟ",
  "bus": "รถบัส",
  "airport": "สนามบิน",
  "hotel": "โรงแรม",
  "family": "ครอบครัว",
  "work": "งาน",
  "shop": "ร้านค้า",
  "buy": "ซื้อ",
  "sell": "ขาย",
  "price": "ราคา",
};

export function backfillThai(items = []) {
  return items.map((it) => {
    if (it.type === "word" || it.type === "phrase") {
      const key = it.term?.toLowerCase().trim();
      if (!it.thai && key && THAI_SEED[key]) {
        return { ...it, thai: THAI_SEED[key] };
      }
    }
    return it;
  });
}

