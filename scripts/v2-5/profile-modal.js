import { PROFILE_FULL_CONTENT } from '../data/profile-full-content.js';

const el = id => document.getElementById(id);
const clean = value => String(value ?? '')
    .replace(/\s*\(theo\s+(?:Excel|DOCX)\s+cập nhật\)\.?/giu, '')
    .replace(/\s*[–—-]?\s*theo\s+(?:Excel|DOCX)\s+cập nhật\.?/giu, '')
    .replace(/\s+([,)])/g, '$1')
    .trim();
const valid = value => {
    const text = clean(value);
    return Boolean(text) && text !== '—' && !/\(\s*\?\s*\)|(?:đang\s+(?:được\s+)?(?:xác minh|cập nhật)|đang\s+cần\s+xác minh)/iu.test(text);
};
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const formatted = value => esc(value).replace(/\r?\n/g, '<br>');
const items = value => (Array.isArray(value) ? value : [value]).map(clean).filter(valid);
const completeField = (value, fallback = '') => items(value).join('\n') || fallback;
const completeItems = (value, fallback = []) => items(value).length ? items(value) : items(fallback);

// Tiền tố Hiệu trưởng được đối chiếu trực tiếp với 13 ảnh đã chuẩn hóa.
const PRINCIPAL_MODAL_NAMES = Object.freeze({
    'HT-01': 'GS.TSKH. Lê Văn Thiêm',
    'HT-02': 'GS. Đặng Thai Mai',
    'HT-03': 'GS.VS. Phạm Huy Thông',
    'HT-04': 'GS.TS.NGND. Nguyễn Lương Ngọc',
    'HT-05': 'GS.VS.TSKH. Nguyễn Cảnh Toàn',
    'HT-06': 'GS.TS.NGND. Dương Trọng Bái',
    'HT-07': 'PGS.TS.NGND. Phạm Quý Tư',
    'HT-08': 'GS.TS.NGND. Vũ Tuấn',
    'HT-09': 'PGS.TS.NGƯT. Nghiêm Đình Vỳ',
    'HT-10': 'GS.TS.NGƯT. Đinh Quang Báo',
    'HT-11': 'GS.TS.NGƯT. Nguyễn Viết Thịnh',
    'HT-12': 'GS.TS.NGƯT. Nguyễn Văn Minh',
    'HT-13': 'PGS.TS. Nguyễn Đức Sơn'
});

function bareProfileName(value) {
    return String(value || '').replace(
        /^(?:(?:GS|PGS|TSKH|TS|VS|NGND|NGƯT|NDND)\.?\s*|Đ\s*[\/-]\s*c\.?\s*|Đồng\s+chí\s+|Đại\s+tá\s+|Nhà\s+giáo\s+)+/giu,
        ''
    ).trim();
}

function modalDisplayName(person) {
    if (person.rk === 'ht') return PRINCIPAL_MODAL_NAMES[person.code] || person.name;
    if (person.rk === 'du' || person.rk === 'bt') return `Đồng chí ${bareProfileName(person.name)}`;
    return person.name;
}

function expandable(value, tag = 'div', threshold = 150) {
    const text = String(value ?? '');
    if (text.length <= threshold) return `<${tag}>${formatted(text)}</${tag}>`;
    return `<div class="expandable-copy"><${tag} class="expandable-text">${formatted(text)}</${tag}><button class="expand-toggle" type="button" aria-expanded="false">... Xem thêm</button></div>`;
}

function bioField(label, value, fallback, full = false) {
    const text = completeField(value, fallback);
    return valid(text) ? `<div class="bitem${full ? ' full' : ''}"><label>${esc(label)}</label>${expandable(text, 'p', full ? 150 : 95)}</div>` : '';
}

function contributionSection(title, value) {
    const list = items(value);
    return list.length ? `<section class="asec"><h3>${esc(title)}</h3><ul class="alist">${list.map(item => `<li>${expandable(item, 'div', 145)}</li>`).join('')}</ul></section>` : '';
}

function publicSource(value) {
    const source = String(value ?? '').replace(/\s*[–—-]?\s*nguồn(?:\s+hyperlink)?\s+cột\s+G(?:\s*[–—-]\s*[A-Z]{2}-\d+)?/giu, '')
        .replace(/\s+trong\s+cột\s+G/giu, '').replace(/\s*[–—-]?\s*(?:trích\s+trong\s+)?DOCX\s+cập nhật(?:\s*[–—-]\s*[A-Z]{2}-\d+)?/giu, '')
        .replace(/\s*[–—-]?\s*theo\s+(?:Excel|DOCX)\s+cập nhật/giu, '').replace(/\s*[–—-]\s*$/u, '').trim();
    return valid(source) ? source : '';
}

function safeMedia(value) {
    const url = String(value || '').trim();
    return /^(https?:\/\/|\.\.?\/|data:image\/)/i.test(url) ? esc(url) : '';
}

function memoryCard(raw, person) {
    const item = typeof raw === 'string' ? { type: 'text', text: raw } : (raw || {});
    const type = item.type || 'text';
    const media = safeMedia(item.src || item.url);
    const text = clean(item.text || item.caption || '');
    if (!media && !valid(text)) return '';
    const title = item.title ? `<div class="memory-title">${esc(item.title)}</div>` : '';
    const sourceText = publicSource(item.source);
    const source = sourceText ? `<div class="memory-source">Nguồn: ${esc(sourceText)}</div>` : '';
    let content = '';
    if (type === 'image' && media) content = `<img src="${media}" alt="${esc(item.caption || item.title || person.name)}">${valid(text) ? `<div>${esc(text)}</div>` : ''}`;
    else if (type === 'audio' && media) content = `<audio controls preload="none" src="${media}"></audio>`;
    else if (type === 'video' && media) content = `<video controls preload="metadata" src="${media}"></video>`;
    else content = expandable(text, type === 'quote' ? 'blockquote' : 'div', 175);
    return `<article class="memory-card">${title}${content}${source}</article>`;
}

function sourceMemoryCards(values, person) {
    const cards = [];
    items(values).forEach(text => {
        if (/^[-–—]\s*/u.test(text) && cards.length && !cards.at(-1).source) cards.at(-1).source = text.replace(/^[-–—]\s*|\s*[-–—]$/gu, '').trim();
        else cards.push({ type: /^[“"]/u.test(text) ? 'quote' : 'text', text, source: '' });
    });
    return cards.map(item => memoryCard(item, person)).join('');
}

export function isProfileModalOpen() { return el('modal-wrap')?.classList.contains('open') || false; }

export function showProfileModalMenu() {
    el('modal').classList.remove('detail-open');
    el('modal-page-label').textContent = 'Hồ sơ nhân vật';
    document.querySelectorAll('.tb').forEach(button => { button.classList.remove('on'); button.setAttribute('aria-selected', 'false'); });
    document.querySelectorAll('.tp').forEach(panel => panel.classList.remove('on'));
    el('mbody').scrollTop = 0;
}

export function closeProfileModal() {
    el('modal-wrap').classList.remove('open');
    showProfileModalMenu();
}

export function openProfileModal(person) {
    el('modal').dataset.theme = person.rk === 'du' ? 'party' : person.rk === 'bt' ? 'youth' : 'principal';
    el('mrole').textContent = person.role;
    const displayName = modalDisplayName(person);
    el('mname').textContent = displayName;
    const length = Array.from(displayName || '').length;
    el('mname').style.fontSize = length > 32 ? '.86rem' : length > 27 ? '.99rem' : length > 22 ? '1.04rem' : '1.14rem';
    el('mperiod').textContent = person.period;

    const photo = el('mphoto');
    const fallback = el('mavatar-fallback');
    const avatar = el('mavatar');
    const portrait = person.sources?.portrait;
    const photoUrl = portrait ? `./${String(portrait).replace(/^\.\//u, '')}` : (person.photo || person.portrait || person.imageUrl || person.image || '');
    avatar.classList.remove('photo-fitted');
    avatar.style.removeProperty('--photo-width');
    avatar.style.removeProperty('--photo-mobile-width');
    avatar.style.removeProperty('--photo-ratio');
    fallback.textContent = person.emoji || '👤'; fallback.style.display = ''; photo.style.display = 'none'; photo.removeAttribute('src');
    if (photoUrl) {
        photo.alt = `Chân dung ${person.name}`;
        photo.onload = () => {
            const ratio = photo.naturalWidth / photo.naturalHeight || 1;
            const maxWidth = 270;
            const maxHeight = 290;
            let fittedWidth = maxWidth;
            if (fittedWidth / ratio > maxHeight) fittedWidth = maxHeight * ratio;
            avatar.style.setProperty('--photo-width', `${fittedWidth}px`);
            avatar.style.setProperty('--photo-mobile-width', `${Math.min(fittedWidth, 128, 160 * ratio)}px`);
            avatar.style.setProperty('--photo-ratio', String(ratio));
            avatar.classList.add('photo-fitted');
            photo.style.display = 'block';
            fallback.style.display = 'none';
        };
        photo.onerror = () => {
            avatar.classList.remove('photo-fitted');
            photo.style.display = 'none';
            fallback.style.display = '';
        };
        photo.src = photoUrl;
    }

    const source = PROFILE_FULL_CONTENT[person.code]?.modal || {};
    const bio = person.bio || {}, fullBio = source.bio || {};
    el('tp-bio').innerHTML = `<h2 class="section-title">Tiểu sử</h2><div class="bgrid">${bioField('Họ và tên / tên khác', fullBio.name, person.name)}${bioField('Năm sinh', fullBio.dob, bio.dob)}${bioField('Quê quán', fullBio.que, bio.que)}${bioField('Vào Đảng', fullBio.dv, bio.dv)}${bioField('Trình độ', fullBio.td, bio.td, true)}${bioField('Chức vụ và quá trình công tác', fullBio.cv, bio.cv, true)}${bioField('Thông tin bổ sung', fullBio.other, '', true)}</div>`;

    const contributions = person.contributions || {}, full = source.contributions || {};
    const labels = person.rk === 'du' ? ['Công tác Đảng', 'Nhà trường', 'Đất nước và xã hội'] : person.rk === 'bt' ? ['Công tác Đoàn', 'Nhà trường', 'Nghiên cứu và xã hội'] : ['Quản lý và xây dựng trường', 'Khoa học – giáo dục', 'Đất nước và xã hội'];
    const contributionHtml = contributionSection(labels[0], completeItems(full.union, contributions.union || person.doan)) + contributionSection(labels[1], completeItems(full.school, contributions.school || person.truong)) + contributionSection(labels[2], completeItems(full.society, contributions.society || person.xahoi || person.society)) + contributionSection('Khen thưởng', full.awards) + contributionSection('Thông tin bổ sung', full.other);
    el('tp-ach').innerHTML = `<h2 class="section-title">Đóng góp</h2><div class="contribution-grid">${contributionHtml}</div>`;

    const memories = Array.isArray(person.memories) ? [...person.memories] : [];
    if (!memories.length && person.quote) memories.push({ type: 'quote', text: person.quote, source: person.name });
    const memoryHtml = source.memories?.length ? sourceMemoryCards(source.memories, person) : memories.map(item => memoryCard(item, person)).join('');
    el('tp-qte').innerHTML = memoryHtml ? `<h2 class="section-title">Hồi ức</h2><div class="memory-grid">${memoryHtml}</div>` : '';
    document.querySelector('.tb[data-t="ach"]').hidden = !contributionHtml;
    document.querySelector('.tb[data-t="qte"]').hidden = !memoryHtml;
    showProfileModalMenu();
    el('modal-wrap').classList.add('open');
}

export function initProfileModal() {
    el('mclose').addEventListener('click', closeProfileModal);
    el('mback').addEventListener('click', showProfileModalMenu);
    el('modal-wrap').addEventListener('click', event => { if (event.target === el('modal-wrap')) closeProfileModal(); });
    el('mbody').addEventListener('click', event => {
        const button = event.target.closest('.expand-toggle'); if (!button) return;
        const copy = button.closest('.expandable-copy'); const expanded = copy.classList.toggle('expanded');
        button.setAttribute('aria-expanded', String(expanded)); button.textContent = expanded ? 'Thu gọn' : '... Xem thêm';
    });
    document.querySelectorAll('.tb').forEach(button => button.addEventListener('click', () => {
        document.querySelectorAll('.tb').forEach(item => { item.classList.remove('on'); item.setAttribute('aria-selected', 'false'); });
        document.querySelectorAll('.tp').forEach(panel => panel.classList.remove('on'));
        button.classList.add('on'); button.setAttribute('aria-selected', 'true'); el(`tp-${button.dataset.t}`).classList.add('on');
        el('modal').classList.add('detail-open');
        el('modal-page-label').textContent = { bio: 'Tiểu sử', ach: 'Đóng góp', qte: 'Hồi ức và chia sẻ' }[button.dataset.t];
        el('mbody').scrollTop = 0;
    }));
}
