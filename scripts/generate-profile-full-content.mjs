import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const topicDir = resolve(scriptDir, "..");
const profilesPath = resolve(scriptDir, "data/profiles.js");
const outputPath = resolve(scriptDir, "data/profile-full-content.js");
const { PROFILE_DATA } = await import(pathToFileURL(profilesPath));
const SUPPLEMENTARY_DOCX = {};

function decodeXml(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function extractParagraphs(docxPath) {
  const xml = execFileSync("unzip", ["-p", docxPath, "word/document.xml"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const paragraphs = [];
  for (const match of xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
    const paragraph = match[0]
      .replace(/<w:tab\s*\/>/g, "\t")
      .replace(/<w:(?:br|cr)\s*\/>/g, "\n")
      .replace(/<w:noBreakHyphen\s*\/>/g, "‑")
      .replace(/<w:softHyphen\s*\/>/g, "")
      .replace(/<[^>]+>/g, "");
    const text = decodeXml(paragraph)
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
    if (text) paragraphs.push(text);
  }
  return paragraphs;
}

function splitIntoDisplaySections(paragraphs) {
  const sections = { bio: [], contributions: [], memories: [] };
  let current = "bio";
  for (const paragraph of paragraphs) {
    const normalized = paragraph.normalize("NFC").trim();
    if (/^TÀI LIỆU BỔ SUNG:/i.test(normalized)) {
      current = "bio";
      sections[current].push(paragraph);
      continue;
    }
    if (/^3\.\s*(?:Thành tích|Các đóng góp|Đóng góp)/i.test(normalized)) {
      current = "contributions";
      continue;
    }
    if (/^4\.?\s*(?:Hồi ức|Trích dẫn hồi ức)/i.test(normalized)) {
      current = "memories";
      continue;
    }
    if (/^2\.\s*Tiểu sử/i.test(normalized) || /^1\.?\s*Mở đầu/i.test(normalized)) {
      current = "bio";
      continue;
    }
    if (/^-\s*(?:Thành tích|Đóng góp|Khen thưởng)/i.test(normalized) && current !== "memories") {
      current = "contributions";
    } else if (/^-\s*Hồi ức/i.test(normalized)) {
      current = "memories";
    }
    sections[current].push(paragraph);
  }
  return sections;
}

function cleanLabelValue(paragraph) {
  const colon = paragraph.indexOf(":");
  return colon < 0 ? "" : paragraph.slice(colon + 1).trim();
}

function pushUnique(target, value) {
  const clean = value.replace(/^[-+]\s*/, "").trim();
  if (clean && !target.includes(clean)) target.push(clean);
}

function organizeForModal(sections) {
  const bio = { name: [], dob: [], que: [], dv: [], td: [], cv: [], other: [] };
  let bioField = "other";
  for (const paragraph of sections.bio) {
    const line = paragraph.trim();
    let nextField = null;
    if (/^TÀI LIỆU BỔ SUNG:/i.test(line) || /^-\s*Nguồn tham khảo/i.test(line)) continue;
    if (/^-\s*(?:Họ và tên|Tên thật)/i.test(line)) nextField = "name";
    else if (/^-\s*(?:Năm sinh|Ngày sinh)/i.test(line)) nextField = "dob";
    else if (/^-\s*Quê quán/i.test(line)) nextField = "que";
    else if (/^-\s*Ngày vào (?:vào )?[Đđ]ảng/i.test(line)) nextField = "dv";
    else if (/^-\s*Trình độ/i.test(line)) nextField = "td";
    else if (/^-\s*(?:Các chức vụ|Chức vụ)/i.test(line)) nextField = "cv";

    if (nextField) {
      bioField = nextField;
      pushUnique(bio[bioField], cleanLabelValue(line));
    } else {
      pushUnique(bio[bioField], line);
    }
  }

  const contributions = { union: [], school: [], society: [], awards: [], other: [] };
  let contributionField = "other";
  for (const paragraph of sections.contributions) {
    const line = paragraph.trim();
    let nextField = null;
    if (/^-\s*(?:Thành tích nổi bật trong hoạt động|Đóng góp (?:với|cho) công tác|Đóng góp cho phong trào)/i.test(line)) nextField = "union";
    else if (/^-\s*Đóng góp (?:với|cho|trong sự nghiệp giáo dục chung của) (?:Nhà|nhà|sự nghiệp Giáo dục của Nhà)/i.test(line)) nextField = "school";
    else if (/^-\s*Đóng góp (?:với|cho|đối với) (?:đất nước|xã hội|giáo dục)/i.test(line)) nextField = "society";
    else if (/^-\s*Khen thưởng/i.test(line)) nextField = "awards";

    if (nextField) {
      contributionField = nextField;
      pushUnique(contributions[contributionField], cleanLabelValue(line));
    } else {
      pushUnique(contributions[contributionField], line);
    }
  }

  const memories = sections.memories.map((paragraph) => paragraph.trim()).filter(Boolean);
  return { bio, contributions, memories };
}

const content = {};
for (const profile of PROFILE_DATA) {
  const source = profile.sources?.docx;
  if (!source || source.startsWith("Đang thiếu")) continue;
  const docxPath = resolve(topicDir, source);
  try {
    const sources = [source].concat(SUPPLEMENTARY_DOCX[profile.code] || []);
    const paragraphs = [];
    for (const item of sources) {
      if (paragraphs.length) paragraphs.push(`TÀI LIỆU BỔ SUNG: ${item}`);
      paragraphs.push(...extractParagraphs(resolve(topicDir, item)));
    }
    const sections = splitIntoDisplaySections(paragraphs);
    content[profile.code] = { sources, modal: organizeForModal(sections) };
  } catch (error) {
    console.warn(`Không thể đọc ${profile.code}: ${source}\n  ${error.message}`);
  }
}

const banner = `// Generated only from the three canonical Chủ đề 5 source folders.\n// Run: node scripts/generate-profile-full-content.mjs\n`;
writeFileSync(
  outputPath,
  `${banner}export const PROFILE_FULL_CONTENT = ${JSON.stringify(content, null, 2)};\n`,
  "utf8",
);

console.log(`Đã xuất toàn văn ${Object.keys(content).length}/${PROFILE_DATA.length} hồ sơ.`);
