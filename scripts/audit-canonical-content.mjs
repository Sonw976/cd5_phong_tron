import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir=dirname(fileURLToPath(import.meta.url));
const topicDir=resolve(scriptDir,"..");
const { PROFILE_DATA }=await import(pathToFileURL(resolve(scriptDir,"data/profiles.js")));
const { PROFILE_FULL_CONTENT }=await import(pathToFileURL(resolve(scriptDir,"data/profile-full-content.js")));
const errors=[];
const allowedMissingDocx=new Set(["DT-04","DT-05","DT-09","DT-10"]);
const expected={ht:13,du:19,bt:29};

async function fileExists(value){
  if(!value || /^Đang thiếu/u.test(value))return false;
  try{await access(resolve(topicDir,String(value).replace(/^\.\//u,"")));return true;}
  catch{return false;}
}

for(const [group,count] of Object.entries(expected)){
  const actual=PROFILE_DATA.filter(profile=>profile.rk===group).length;
  if(actual!==count)errors.push(`${group}: cần ${count}, nhận ${actual}`);
}
const codes=PROFILE_DATA.map(profile=>profile.code);
codes.forEach((code,index)=>{if(codes.indexOf(code)!==index)errors.push(`Trùng mã ${code}`);});

for(const profile of PROFILE_DATA){
  if(!profile.name || !profile.period || !profile.role)errors.push(`${profile.code}: thiếu nhận diện`);
  if(!await fileExists(profile.image))errors.push(`${profile.code}: ảnh không tồn tại ${profile.image}`);
  const hasDocx=await fileExists(profile.sources?.docx);
  if(!hasDocx&&!allowedMissingDocx.has(profile.code))errors.push(`${profile.code}: DOCX không tồn tại`);
  if(hasDocx&&!PROFILE_FULL_CONTENT[profile.code])errors.push(`${profile.code}: chưa trích xuất DOCX`);
  if(!hasDocx&&PROFILE_FULL_CONTENT[profile.code])errors.push(`${profile.code}: có nội dung DOCX ngoài quy tắc`);
  if(/Hồ sơ .*đã cập nhật| - unzip/u.test(JSON.stringify(profile)))errors.push(`${profile.code}: còn đường dẫn nguồn cũ`);
  if(/[�]|Ã|á»/u.test(JSON.stringify(profile)))errors.push(`${profile.code}: có dấu hiệu lỗi Unicode`);
  const modal=PROFILE_FULL_CONTENT[profile.code]?.modal;
  if(modal){
    if(!modal.bio || !modal.contributions || !Array.isArray(modal.memories))errors.push(`${profile.code}: thiếu cấu trúc ba tab`);
  }
}

if(errors.length){
  console.error(errors.join("\n"));
  process.exitCode=1;
}else{
  console.log(`PASS: ${PROFILE_DATA.length} hồ sơ, 61 ảnh, 57 DOCX, 4 ngoại lệ đã chốt, không còn đường dẫn nguồn cũ.`);
}
