import { access, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir=dirname(fileURLToPath(import.meta.url));
const topicDir=resolve(scriptDir,"..");
const { PROFILE_DATA }=await import(pathToFileURL(resolve(scriptDir,"data/profiles.js")));

async function exists(relativePath){
  if(!relativePath || /^Đang thiếu/u.test(relativePath))return false;
  try{await access(resolve(topicDir,String(relativePath).replace(/^\.\//u,"")));return true;}
  catch{return false;}
}

const records=[];
for(const profile of PROFILE_DATA){
  const docx=profile.sources?.docx||"";
  const portrait=profile.sources?.portrait||String(profile.image||"").replace(/^\.\//u,"");
  const hasDocx=await exists(docx);
  const hasPortrait=await exists(portrait);
  records.push({
    code:profile.code,
    group:profile.rk,
    name:profile.name,
    role:profile.role,
    period:profile.period,
    sourceDocx:docx,
    portrait,
    hasDocx,
    hasPortrait,
    excelReference:(profile.sources?.references||[]).find(item=>/\.xlsx/u.test(item))||"",
    columnGReferences:(profile.sources?.references||[]).filter(item=>/^https?:/u.test(item)),
    verificationNotes:profile.sources?.verificationNotes||[],
    status:hasPortrait?(hasDocx?"Hoàn chỉnh":"Thiếu DOCX – dùng Excel và cột G"):"Thiếu ảnh"
  });
}

const report={
  generatedAt:new Date().toISOString(),
  canonicalRoots:["BÍ THƯ ĐẢNG ỦY","BÍ THƯ ĐOÀN TRƯỜNG ","HIỆU TRƯỞNG NHÀ TRƯỜNG "],
  policy:{
    docx:"Nguồn nội dung chính",
    excel:"Đối chiếu mã, danh mục, nhiệm kỳ và thứ tự",
    columnG:"Luôn kiểm tra; được dùng các liên kết do nhóm cung cấp",
    missing:"Đang xác minh...",
    conflicts:"Giữ kết quả đã xác minh khi DOCX có lỗi rõ ràng và lưu verificationNotes"
  },
  summary:{
    total:records.length,
    byGroup:Object.fromEntries(["ht","du","bt"].map(group=>[group,records.filter(item=>item.group===group).length])),
    withDocx:records.filter(item=>item.hasDocx).length,
    withPortrait:records.filter(item=>item.hasPortrait).length,
    missingDocx:records.filter(item=>!item.hasDocx).map(item=>item.code),
    missingPortrait:records.filter(item=>!item.hasPortrait).map(item=>item.code)
  },
  records
};

await writeFile(resolve(scriptDir,"data/content-verification.json"),JSON.stringify(report,null,2)+"\n","utf8");
console.log(`Đã kiểm kê ${records.length} hồ sơ; ${report.summary.withDocx} DOCX; ${report.summary.withPortrait} ảnh.`);
