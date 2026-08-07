// ═══════════════════════════════════════════════════════
// generate-pdf.mjs — Netlify Function for "Nos premiers mots"
// v3: chat bubbles + alignment fixes
// ═══════════════════════════════════════════════════════

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';


// ─── PATHS ───
const FONTS_DIR = path.resolve('fonts');

// ─── COLORS (warm coral + soft steel blue) ───
const ROSE = [194, 124, 90];        // #C27C5A — terracotta
const ROSE_BG = [244, 228, 218];    // #F4E4DA — terracotta bg
const BLUE = [90, 143, 168];        // #5A8FA8 — océan
const BLUE_BG = [222, 236, 241];    // #DEECF1 — océan bg
const INK = [26, 26, 24];
const INK_SOFT = [74, 70, 64];
const INK_MUTED = [138, 133, 125];
const CREAM_BG = [250, 247, 243];
const BORDER = [232, 226, 218];
const WHITE = [255, 255, 255];
const GOLD = [196, 154, 59];
const GREEN = [91, 168, 122];
const LIGHT_LINE = [240, 236, 230];

// ─── EMOJI ───
function hasEmoji(text) { return /\p{Extended_Pictographic}/u.test(text); }
function splitTextEmoji(text) {
  if (!hasEmoji(text)) return [{ text, emoji: false }];
  const segments = [];
  let lastIndex = 0;
  const regex = /(\p{Extended_Pictographic}(?:\uFE0F)?(?:\u200d\p{Extended_Pictographic}(?:\uFE0F)?)*)/gu;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) segments.push({ text: text.slice(lastIndex, match.index), emoji: false });
    segments.push({ text: match[0], emoji: true });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex), emoji: false });
  return segments;
}

// ─── PAGE ───
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;
const SAFE_BOTTOM = PAGE_H - MARGIN - 20;

function ensureSpace(doc, needed) {
  if (doc.y + needed > SAFE_BOTTOM) { doc.addPage(); doc.y = MARGIN; return true; }
  return false;
}

// Draw mixed text inline (emoji + text) — returns final Y
function drawMixedText(doc, text, x, y, options = {}) {
  const { fontSize = 11, color = INK, maxWidth = CONTENT_W, lineHeight = 1.4 } = options;
  const segments = splitTextEmoji(text);
  let curX = x, curY = y;
  const lineH = fontSize * lineHeight;
  for (const seg of segments) {
    doc.font(seg.emoji ? 'NotoEmoji' : 'Inter').fontSize(seg.emoji ? fontSize * 0.95 : fontSize);
    const words = seg.emoji ? [seg.text] : seg.text.split(/( )/);
    for (const word of words) {
      if (!word) continue;
      const w = doc.widthOfString(word);
      if (curX + w > x + maxWidth && curX > x) { curX = x; curY += lineH; if (curY > SAFE_BOTTOM) { doc.addPage(); curY = MARGIN; } }
      doc.fillColor(color).text(word, curX, curY, { lineBreak: false });
      curX += w;
    }
  }
  doc.y = curY + lineH;
  return doc.y;
}

// Measure mixed text height without drawing
function measureMixedText(doc, text, fontSize, maxWidth) {
  const segments = splitTextEmoji(text);
  let curX = 0, lines = 1;
  const lineH = fontSize * 1.4;
  for (const seg of segments) {
    doc.font(seg.emoji ? 'NotoEmoji' : 'Inter').fontSize(seg.emoji ? fontSize * 0.95 : fontSize);
    const words = seg.emoji ? [seg.text] : seg.text.split(/( )/);
    for (const word of words) {
      if (!word) continue;
      const w = doc.widthOfString(word);
      if (curX + w > maxWidth && curX > 0) { curX = 0; lines++; }
      curX += w;
    }
  }
  return lines * lineH;
}

function drawBar(doc, x, y, w, val1, val2, color1 = ROSE, color2 = BLUE) {
  const total = val1 + val2; if (total === 0) return;
  const barH = 8, r = 4, w1 = (val1 / total) * w;
  doc.roundedRect(x, y, w, barH, r).fill(BORDER);
  if (w1 > 0) { doc.save(); doc.roundedRect(x, y, w, barH, r).clip(); doc.rect(x, y, w1, barH).fill(color1); doc.restore(); }
  if (val2 > 0) { doc.save(); doc.roundedRect(x, y, w, barH, r).clip(); doc.rect(x + w1, y, w - w1, barH).fill(color2); doc.restore(); }
}

function drawSep(doc, y) { doc.moveTo(MARGIN + CONTENT_W * 0.3, y).lineTo(MARGIN + CONTENT_W * 0.7, y).strokeColor(BORDER).lineWidth(0.5).stroke(); }
function fmtNum(n) { return n != null ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : '0'; }

function drawArc(doc, cx, cy, r, startAngle, endAngle, color, lineWidth) {
  const steps = 60, angleStep = (endAngle - startAngle) / steps;
  doc.save().lineWidth(lineWidth).strokeColor(color).lineCap('butt');
  for (let i = 0; i < steps; i++) {
    const a1 = startAngle + i * angleStep, a2 = a1 + angleStep;
    doc.moveTo(cx + r * Math.cos(a1), cy + r * Math.sin(a1)).lineTo(cx + r * Math.cos(a2), cy + r * Math.sin(a2)).stroke();
  }
  doc.restore();
}

// ═══ COVER ═══
function drawCover(doc, name1, name2, stats, msgs, colors) {
  const firstDate = msgs[0]?.date || '', lastDate = msgs[msgs.length - 1]?.date || '';
  doc.rect(0, 0, PAGE_W, PAGE_H).fill(CREAM_BG);
  doc.moveTo(PAGE_W * 0.35, 120).lineTo(PAGE_W * 0.65, 120).strokeColor(ROSE).lineWidth(0.8).stroke();

  doc.font('Playfair-Italic').fontSize(36).fillColor(INK);
  doc.text('Nos premiers mots', 0, 160, { align: 'center', width: PAGE_W });
  doc.font('Inter').fontSize(11).fillColor(INK_MUTED);
  doc.text('L\'histoire de', 0, 220, { align: 'center', width: PAGE_W });
  doc.font('Playfair').fontSize(24).fillColor(ROSE);
  doc.text(`${name1} & ${name2}`, 0, 250, { align: 'center', width: PAGE_W });
  doc.font('Inter').fontSize(10).fillColor(INK_MUTED);
  doc.text(`${firstDate} — ${lastDate}`, 0, 300, { align: 'center', width: PAGE_W });

  // Total — with proper spacing
  doc.font('Playfair').fontSize(48).fillColor(ROSE);
  doc.text(fmtNum(stats.total), 0, 370, { align: 'center', width: PAGE_W });
  doc.moveDown(0.3);
  doc.font('Inter').fontSize(12).fillColor(INK_MUTED);
  doc.text('messages échangés', 0, 430, { align: 'center', width: PAGE_W });
  // Small decorative dots
  const dotY = 455;
  [PAGE_W/2 - 12, PAGE_W/2, PAGE_W/2 + 12].forEach(dx => {
    doc.circle(dx, dotY, 1.5).fill(ROSE);
  });

  // Stat icons
  const statsY = 490;
  const items = [];
  if (stats.hearts > 0) items.push({ emoji: '❤', val: fmtNum(stats.hearts), label: 'cœurs' });
  if (stats.laughs > 0) items.push({ emoji: '😂', val: fmtNum(stats.laughs), label: 'fous rires' });
  if (stats.bonneNuit > 0) items.push({ emoji: '🌙', val: fmtNum(stats.bonneNuit), label: 'bonne nuit' });
  if (stats.jeTaime > 0) items.push({ emoji: '💕', val: fmtNum(stats.jeTaime), label: 'je t\'aime' });
  if (items.length > 0) {
    const spacing = CONTENT_W / items.length;
    items.forEach((item, i) => {
      const ix = MARGIN + spacing * i + spacing / 2;
      doc.font('NotoEmoji').fontSize(16).fillColor(INK);
      doc.text(item.emoji, ix - 40, statsY, { width: 80, align: 'center' });
      doc.font('Playfair').fontSize(18).fillColor(INK);
      doc.text(item.val, ix - 40, statsY + 24, { width: 80, align: 'center' });
      doc.font('Inter').fontSize(8).fillColor(INK_MUTED);
      doc.text(item.label, ix - 40, statsY + 48, { width: 80, align: 'center' });
    });
  }

  doc.moveTo(PAGE_W * 0.35, PAGE_H - 120).lineTo(PAGE_W * 0.65, PAGE_H - 120).strokeColor(ROSE).lineWidth(0.8).stroke();
  doc.font('Playfair-Italic').fontSize(11).fillColor(INK_MUTED);
  doc.text('Chaque message compte.', 0, PAGE_H - 100, { align: 'center', width: PAGE_W });
}

// ═══ CHAPTER TITLE ═══
function drawChapterTitle(doc, number, title, subtitle) {
  doc.addPage();
  doc.rect(0, 0, PAGE_W, PAGE_H).fill(CREAM_BG);

  const cy = PAGE_H * 0.40;

  // Decorative dots above
  const dotsY = cy - 60;
  [PAGE_W/2 - 12, PAGE_W/2, PAGE_W/2 + 12].forEach(dx => {
    doc.circle(dx, dotsY, 1.5).fill(ROSE);
  });

  // Chapter number
  doc.font('Inter').fontSize(11).fillColor(INK_MUTED);
  doc.text('Chapitre ' + number, 0, cy - 40, { align: 'center', width: PAGE_W });

  // Decorative line
  drawSep(doc, cy - 18);

  // Title
  doc.font('Playfair').fontSize(26).fillColor(INK);
  doc.text(title, 0, cy + 5, { align: 'center', width: PAGE_W });

  // Subtitle
  if (subtitle) {
    doc.moveDown(0.6);
    doc.font('Playfair-Italic').fontSize(12).fillColor(INK_MUTED);
    doc.text(subtitle, 0, cy + 45, { align: 'center', width: PAGE_W });
  }

  // Decorative line below
  drawSep(doc, cy + 80);

  // Decorative dots below
  [PAGE_W/2 - 12, PAGE_W/2, PAGE_W/2 + 12].forEach(dx => {
    doc.circle(dx, cy + 100, 1.5).fill(ROSE);
  });
}

// ═══ CONVERSATION — CHAT BUBBLES ═══
function drawConversation(doc, msgs, name1, name2, nameMap, colors) {
  doc.addPage();
  doc.y = MARGIN;
  let lastDate = '';
  const maxBubbleW = CONTENT_W * 0.72;
  const bubblePadX = 10;
  const bubblePadY = 6;
  const bubbleRadius = 10;

  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const displaySender = nameMap?.[m.sender] || m.sender;
    const isName1 = displaySender === name1;
    const senderColor = isName1 ? colors.c1 : colors.c2;
    const bubbleBg = isName1 ? colors.bg1 : colors.bg2;

    // Date separator
    if (m.date !== lastDate) {
      ensureSpace(doc, 35);
      if (lastDate !== '') doc.moveDown(0.3);
      const dateY = doc.y;
      // Date pill
      const dateText = m.date;
      doc.font('Inter').fontSize(8);
      const dtW = doc.widthOfString(dateText) + 20;
      const dtX = (PAGE_W - dtW) / 2;
      doc.roundedRect(dtX, dateY, dtW, 18, 9).fill([245, 242, 238]);
      doc.font('Inter').fontSize(8).fillColor(INK_MUTED);
      doc.text(dateText, dtX, dateY + 4, { width: dtW, align: 'center' });
      doc.y = dateY + 28;
      lastDate = m.date;
    }

    // Measure text height
    const textW = maxBubbleW - bubblePadX * 2 - 8;
    let textH;
    if (hasEmoji(m.text)) {
      textH = measureMixedText(doc, m.text, 9.5, textW);
    } else {
      doc.font('Inter').fontSize(9.5);
      textH = doc.heightOfString(m.text, { width: textW });
    }

    // Bubble dimensions
    const nameH = 12;
    const timeH = 10;
    const totalBubbleH = bubblePadY + nameH + textH + timeH + bubblePadY;

    ensureSpace(doc, totalBubbleH + 8);

    const msgY = doc.y;

    // Measure actual text width for tighter bubbles
    doc.font('Inter').fontSize(9.5);
    const singleLineW = doc.widthOfString(m.text);
    const actualBubbleW = Math.min(maxBubbleW, singleLineW + bubblePadX * 2 + 16);
    const bubbleW = Math.max(actualBubbleW, 80);

    // Position: left for name1, right for name2
    const bubbleX = isName1 ? MARGIN : (MARGIN + CONTENT_W - bubbleW);

    // Draw bubble background
    doc.roundedRect(bubbleX, msgY, bubbleW, totalBubbleH, bubbleRadius).fill(bubbleBg);

    // Sender name
    doc.font('Inter').fontSize(7.5).fillColor(senderColor);
    doc.text(displaySender, bubbleX + bubblePadX, msgY + bubblePadY, { width: bubbleW - bubblePadX * 2 });

    // Message text
    const contentY = msgY + bubblePadY + nameH;
    const contentW = bubbleW - bubblePadX * 2 - 4;
    if (hasEmoji(m.text)) {
      drawMixedText(doc, m.text, bubbleX + bubblePadX, contentY, { fontSize: 9.5, maxWidth: contentW, color: INK_SOFT });
    } else {
      doc.font('Inter').fontSize(9.5).fillColor(INK_SOFT);
      doc.text(m.text, bubbleX + bubblePadX, contentY, { width: contentW });
    }

    // Time
    doc.font('Inter').fontSize(7).fillColor(INK_MUTED);
    const timeText = m.time;
    const tw = doc.widthOfString(timeText);
    doc.text(timeText, bubbleX + bubbleW - tw - bubblePadX, msgY + totalBubbleH - timeH - bubblePadY + 2, { lineBreak: false });

    doc.y = msgY + totalBubbleH + 5;
  }
}

// ═══ VUE D'ENSEMBLE ═══
function drawStatsOverview(doc, stats, name1, name2, colors) {
  doc.addPage(); doc.y = MARGIN + 10;
  doc.font('Playfair').fontSize(18).fillColor(INK);
  doc.text('Vue d\'ensemble', MARGIN, doc.y, { width: CONTENT_W, align: 'center' });
  doc.moveDown(1.5);

  // ── Donut (smooth SVG arcs) ──
  const donutCx = PAGE_W / 2;
  const donutCy = doc.y + 70;
  const donutR = 58;
  const donutW = 16;
  const total = stats.count1 + stats.count2;
  const angle1 = (stats.count1 / total) * Math.PI * 2;
  const startAngle = Math.PI;  // Start from LEFT (9 o'clock) so person1 is visually on the left

  // Background ring
  doc.circle(donutCx, donutCy, donutR).lineWidth(donutW).strokeColor([243, 240, 236]).stroke();

  // Person 1 arc (rose) — smooth SVG arc
  const endAngle1 = startAngle + angle1;
  const ax0 = donutCx + donutR * Math.cos(startAngle);
  const ay0 = donutCy + donutR * Math.sin(startAngle);
  const ax1 = donutCx + donutR * Math.cos(endAngle1);
  const ay1 = donutCy + donutR * Math.sin(endAngle1);
  const largeArc1 = angle1 > Math.PI ? 1 : 0;
  doc.path(`M ${ax0} ${ay0} A ${donutR} ${donutR} 0 ${largeArc1} 1 ${ax1} ${ay1}`)
     .lineWidth(donutW).strokeColor(colors.c1).stroke();

  // Person 2 arc (blue)
  const angle2 = Math.PI * 2 - angle1;
  const ax2 = donutCx + donutR * Math.cos(endAngle1 + angle2);
  const ay2 = donutCy + donutR * Math.sin(endAngle1 + angle2);
  const largeArc2 = angle2 > Math.PI ? 1 : 0;
  doc.path(`M ${ax1} ${ay1} A ${donutR} ${donutR} 0 ${largeArc2} 1 ${ax2} ${ay2}`)
     .lineWidth(donutW).strokeColor(colors.c2).stroke();

  // Center text
  doc.font('Playfair').fontSize(26).fillColor(INK);
  doc.text(fmtNum(stats.total), donutCx - 45, donutCy - 18, { width: 90, align: 'center' });
  doc.font('Inter').fontSize(9).fillColor(INK_MUTED);
  doc.text('messages', donutCx - 45, donutCy + 16, { width: 90, align: 'center' });

  // Legend
  const legY = donutCy + donutR + 25;
  doc.rect(PAGE_W / 2 - 100, legY, 10, 10).fill(colors.c1);
  doc.font('Inter').fontSize(10).fillColor(INK);
  doc.text(`${name1} — ${stats.pct1}%`, PAGE_W / 2 - 86, legY - 1, { lineBreak: false });
  doc.font('Inter').fontSize(8).fillColor(INK_MUTED);
  doc.text(`${stats.count1} messages`, PAGE_W / 2 - 86, legY + 13, { lineBreak: false });

  doc.rect(PAGE_W / 2 + 20, legY, 10, 10).fill(colors.c2);
  doc.font('Inter').fontSize(10).fillColor(INK);
  doc.text(`${name2} — ${stats.pct2}%`, PAGE_W / 2 + 34, legY - 1, { lineBreak: false });
  doc.font('Inter').fontSize(8).fillColor(INK_MUTED);
  doc.text(`${stats.count2} messages`, PAGE_W / 2 + 34, legY + 13, { lineBreak: false });

  doc.y = legY + 45;
  doc.moveDown(0.5);

  // 6 stat cards — FIXED layout: consistent sizing
  const cards = [
    { emoji: '❤', value: fmtNum(stats.hearts), label: 'cœurs', detail: `${name1}: ${stats.hearts1} · ${name2}: ${stats.hearts2}`, color: ROSE },
    { emoji: '🌙', value: fmtNum(stats.bonneNuit), label: 'bonne nuit', detail: `${name1}: ${stats.bn1} · ${name2}: ${stats.bn2}`, color: BLUE },
    { emoji: '😂', value: fmtNum(stats.laughs), label: 'fous rires', detail: `${name1}: ${stats.laughs1} · ${name2}: ${stats.laughs2}`, color: GOLD },
    { emoji: '💕', value: fmtNum(stats.jeTaime), label: 'je t\'aime', detail: `${name1}: ${stats.jeTaime1 || '?'} · ${name2}: ${stats.jeTaime2 || '?'}`, color: GREEN },
    { emoji: '📅', value: `${fmtNum(stats.totalDays)} j`, label: 'de conversation', detail: `${fmtNum(stats.streak)} jours d'affilée max`, color: INK_SOFT },
    { emoji: '⚡', value: stats.avgResp ? `${stats.avgResp} min` : '—', label: 'réponse moyenne', detail: stats.fast1 != null ? `Record: ${name1} ${stats.fast1}min · ${name2} ${stats.fast2}min` : '', color: ROSE },
  ];

  const colCount = 3;
  const gap = 12;
  const cardW = (CONTENT_W - gap * (colCount - 1)) / colCount;
  const cardH = 82;
  const cardStartY = doc.y;

  cards.forEach((card, i) => {
    const col = i % colCount, row = Math.floor(i / colCount);
    const cx = MARGIN + col * (cardW + gap), cy = cardStartY + row * (cardH + gap);
    doc.roundedRect(cx, cy, cardW, cardH, 8).fill(CREAM_BG);

    doc.font('NotoEmoji').fontSize(14).fillColor(card.color);
    doc.text(card.emoji, cx + 10, cy + 10, { lineBreak: false });

    doc.font('Playfair').fontSize(18).fillColor(card.color);
    doc.text(card.value, cx + 10, cy + 30, { width: cardW - 20 });

    doc.font('Inter').fontSize(8).fillColor(INK_SOFT);
    doc.text(card.label, cx + 10, cy + 53, { width: cardW - 20 });

    doc.font('Inter').fontSize(7).fillColor(INK_MUTED);
    doc.text(card.detail, cx + 10, cy + 66, { width: cardW - 20 });
  });

  doc.y = cardStartY + Math.ceil(cards.length / colCount) * (cardH + gap) + 10;
}

// ═══ FACE À FACE ═══
function drawFaceAFace(doc, stats, name1, name2, colors) {
  doc.addPage(); doc.y = MARGIN + 10;
  doc.font('Playfair').fontSize(18).fillColor(INK);
  doc.text('Face à face', MARGIN, doc.y, { width: CONTENT_W, align: 'center' });
  doc.font('Inter').fontSize(10).fillColor(INK_MUTED);
  doc.text(`${name1} vs ${name2} — qui gagne ?`, MARGIN, doc.y + 4, { width: CONTENT_W, align: 'center' });
  doc.moveDown(2);

  const categories = [
    { emoji: '❤', label: 'Cœurs', v1: stats.hearts1, v2: stats.hearts2 },
    { emoji: '😂', label: 'Fous rires', v1: stats.laughs1, v2: stats.laughs2 },
    { emoji: '💬', label: 'Le + bavard', v1: stats.count1, v2: stats.count2, suffix: ' msgs' },
    { emoji: '📏', label: 'Écrit des pavés', v1: stats.avgWords1, v2: stats.avgWords2, suffix: ' mots/msg' },
    { emoji: '❓', label: 'Le + curieux', v1: stats.questions1, v2: stats.questions2 },
    { emoji: '☀', label: 'Ouvre la conv.', v1: stats.opens1, v2: stats.opens2, suffix: ' j' },
    { emoji: '🌙', label: 'Dit bonne nuit', v1: stats.bn1, v2: stats.bn2 },
    { emoji: '💌', label: 'Double-texteur', v1: stats.maxConsec1, v2: stats.maxConsec2, suffix: ' d\'affilée' },
  ];
  if (stats.fast1 != null && stats.fast2 != null) {
    categories.splice(6, 0, { emoji: '⚡', label: 'Réponse rapide', v1: stats.fast1, v2: stats.fast2, suffix: ' min', invert: true });
  }
  if (stats.closes1 != null) {
    categories.push({ emoji: '🌃', label: 'Ferme la conv.', v1: stats.closes1, v2: stats.closes2, suffix: ' j' });
  }

  const rowH = 52;
  const barW = CONTENT_W * 0.42;
  const barX = MARGIN + CONTENT_W * 0.33;

  for (const cat of categories) {
    ensureSpace(doc, rowH + 5);
    const y = doc.y;

    // Emoji + label
    doc.font('NotoEmoji').fontSize(13).fillColor(INK);
    doc.text(cat.emoji, MARGIN, y + 4, { lineBreak: false });
    doc.font('Inter').fontSize(10).fillColor(INK);
    doc.text(cat.label, MARGIN + 22, y + 3, { lineBreak: false });

    // Winner
    const winner = cat.invert
      ? (cat.v1 < cat.v2 ? 1 : (cat.v1 > cat.v2 ? 2 : 0))
      : (cat.v1 > cat.v2 ? 1 : (cat.v1 < cat.v2 ? 2 : 0));
    const suffix = cat.suffix || '';

    // Name1 value (left side, under label)
    doc.font('Inter').fontSize(9).fillColor(colors.c1);
    doc.text(`${name1}: ${cat.v1}${suffix}`, MARGIN + 22, y + 18, { lineBreak: false });

    // Name2 value (right side)
    doc.font('Inter').fontSize(9).fillColor(colors.c2);
    const v2t = `${name2}: ${cat.v2}${suffix}`;
    doc.text(v2t, MARGIN + CONTENT_W - doc.widthOfString(v2t), y + 18, { lineBreak: false });

    // Bar
    drawBar(doc, barX, y + 20, barW, cat.v1, cat.v2, colors.c1, colors.c2);

    // Winner indicator
    if (winner !== 0) {
      const winName = winner === 1 ? name1 : name2;
      const winColor = winner === 1 ? colors.c1 : colors.c2;
      doc.font('Inter').fontSize(8).fillColor(winColor);
      doc.text(`👑 ${winName}`, MARGIN + 22, y + 34, { lineBreak: false });
    } else {
      doc.font('Inter').fontSize(8).fillColor(INK_MUTED);
      doc.text('Égalité !', MARGIN + 22, y + 34, { lineBreak: false });
    }

    // Separator
    doc.moveTo(MARGIN, y + rowH - 4).lineTo(MARGIN + CONTENT_W, y + rowH - 4)
       .strokeColor(LIGHT_LINE).lineWidth(0.3).stroke();
    doc.y = y + rowH;
  }
}

// ═══ NOTRE HISTOIRE ═══
function drawNotreHistoire(doc, stats, name1, name2, colors) {
  doc.addPage(); doc.y = MARGIN + 10;
  doc.font('Playfair').fontSize(18).fillColor(INK); doc.text('Le saviez-vous ?', MARGIN, doc.y, { width: CONTENT_W, align: 'center' });
  doc.font('Inter').fontSize(10).fillColor(INK_MUTED); doc.text('Les petits détails de votre couple', MARGIN, doc.y + 4, { width: CONTENT_W, align: 'center' });
  doc.moveDown(2);

  const facts = [
    { emoji: '📖', title: 'Mot préféré', value: stats.topWord ? `"${stats.topWord.word}"` : '—', detail: stats.topWord ? `${stats.topWord.count} fois` : '' },
    { emoji: '🏆', title: 'Jour record', value: `${fmtNum(stats.recordCount)} msgs`, detail: `le ${stats.recordDay}` },
    { emoji: '🔥', title: 'Jours d\'affilée', value: `${stats.streak} jours`, detail: 'sans interruption' },
    { emoji: '📚', title: 'Si c\'était un livre', value: `${stats.bookPages} pages`, detail: `${fmtNum(stats.totalWords)} mots` },
    { emoji: '📏', title: 'Qui écrit des pavés ?', value: stats.avgWords1 > stats.avgWords2 ? name1 : name2, detail: `${Math.max(stats.avgWords1, stats.avgWords2)} mots/msg` },
    { emoji: '💌', title: 'Le double-texteur', value: stats.maxConsec1 > stats.maxConsec2 ? name1 : name2, detail: `${Math.max(stats.maxConsec1, stats.maxConsec2)} msgs d'affilée` },
    { emoji: '❓', title: 'Le + curieux', value: stats.questions1 > stats.questions2 ? name1 : name2, detail: `${Math.max(stats.questions1, stats.questions2)} questions` },
    { emoji: '🦉', title: 'Nuits blanches', value: `${fmtNum(stats.nightMsgs)} msgs`, detail: 'entre 00h et 05h' },
    { emoji: '☀', title: 'Lève-tôt', value: stats.earliest1 < stats.earliest2 ? name1 : name2, detail: `Premier msg à ${stats.earliest1 < stats.earliest2 ? stats.earliest1 : stats.earliest2}` },
    { emoji: '🌙', title: 'Couche-tard', value: stats.latest1 > stats.latest2 ? name1 : name2, detail: `Dernier msg à ${stats.latest1 > stats.latest2 ? stats.latest1 : stats.latest2}` },
    { emoji: '📅', title: 'Jours de conversation', value: `${fmtNum(stats.totalDays)} jours`, detail: 'où vous avez échangé' },
  ];
  if (stats.firstNickname) facts.push({ emoji: '💕', title: 'Premier surnom', value: `"${stats.firstNickname.word}"`, detail: `par ${stats.firstNickname.sender === stats.s1 ? name1 : name2}` });
  if (stats.firstJeTaime) facts.push({ emoji: '❤', title: 'Premier je t\'aime', value: stats.firstJeTaime.sender === stats.s1 ? name1 : name2, detail: `le ${stats.firstJeTaime.date} à ${stats.firstJeTaime.time}` });

  const gap = 10, colW = (CONTENT_W - gap * 2) / 3, cellH = 88, startY = doc.y;
  facts.forEach((f, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const cx = MARGIN + col * (colW + gap), cy = startY + row * (cellH + gap);
    if (cy + cellH > SAFE_BOTTOM) return;
    doc.roundedRect(cx, cy, colW, cellH, 8).fill(CREAM_BG);
    doc.font('NotoEmoji').fontSize(18).fillColor(INK); doc.text(f.emoji, cx, cy + 8, { width: colW, align: 'center' });
    doc.font('Inter').fontSize(7).fillColor(INK_MUTED); doc.text(f.title.toUpperCase(), cx + 6, cy + 32, { width: colW - 12, align: 'center' });
    doc.font('Playfair').fontSize(13).fillColor(ROSE); doc.text(f.value, cx + 6, cy + 46, { width: colW - 12, align: 'center' });
    doc.font('Inter').fontSize(7).fillColor(INK_MUTED); doc.text(f.detail, cx + 6, cy + 66, { width: colW - 12, align: 'center' });
  });
  doc.y = startY + Math.ceil(Math.min(facts.length, 15) / 3) * (cellH + gap);
}

// ═══ TIMELINE ═══
function drawTimeline(doc, keyMoments, name1, name2, nameMap, colors) {
  if (!keyMoments?.length) return;
  ensureSpace(doc, 300); if (doc.y > MARGIN + 200) doc.addPage();
  doc.y = MARGIN + 10;
  doc.font('Playfair').fontSize(18).fillColor(INK); doc.text('Moments clés', MARGIN, doc.y, { width: CONTENT_W, align: 'center' });
  doc.moveDown(2);
  const lineX = MARGIN + 20, textX = lineX + 20, textW = CONTENT_W - 50;
  for (let i = 0; i < keyMoments.length; i++) {
    const m = keyMoments[i], dn = nameMap?.[m.sender] || m.sender, isN1 = dn === name1, dc = isN1 ? ROSE : BLUE;
    ensureSpace(doc, 55);
    const y = doc.y, lineEnd = (i < keyMoments.length - 1) ? y + 55 : y + 10;
    doc.moveTo(lineX, y).lineTo(lineX, lineEnd).strokeColor(BORDER).lineWidth(1).stroke();
    doc.circle(lineX, y + 5, 4).fill(isN1 ? colors.c1 : colors.c2);
    doc.font('Inter').fontSize(8).fillColor(INK_MUTED); doc.text(`${m.date} · ${m.time}`, textX, y - 2, { width: textW });
    doc.font('Inter').fontSize(8).fillColor(isN1 ? colors.c1 : colors.c2); doc.text(dn, textX, y + 10, { lineBreak: false });
    const mt = m.text.length > 120 ? m.text.substring(0, 120) + '...' : m.text;
    if (hasEmoji(mt)) drawMixedText(doc, mt, textX, y + 22, { fontSize: 9.5, maxWidth: textW, color: INK_SOFT });
    else { doc.font('Inter').fontSize(9.5).fillColor(INK_SOFT); doc.text(mt, textX, y + 22, { width: textW }); }
    doc.y = Math.max(doc.y, y + 50);
  }
}

// ═══ END PAGE ═══
function drawEndPage(doc, name1, name2) {
  doc.addPage(); doc.rect(0, 0, PAGE_W, PAGE_H).fill(CREAM_BG);
  const cy = PAGE_H * 0.4;
  doc.font('NotoEmoji').fontSize(30).fillColor(ROSE); doc.text('❤', PAGE_W / 2 - 15, cy - 30, { lineBreak: false });
  doc.font('Playfair').fontSize(20).fillColor(INK); doc.text(`${name1} & ${name2}`, 0, cy + 20, { align: 'center', width: PAGE_W });
  doc.font('Playfair-Italic').fontSize(13).fillColor(INK_MUTED); doc.text('Chaque message compte.', 0, cy + 60, { align: 'center', width: PAGE_W });
  drawSep(doc, cy + 95);
  doc.font('Inter').fontSize(8).fillColor(INK_MUTED); doc.text('Généré par Nos premiers mots — nospremiersmots.fr', 0, cy + 110, { align: 'center', width: PAGE_W });
}

// ═══ SWAP STATS (when s1 maps to name2) ═══
function swapStats(s) {
  return { ...s,
    count1: s.count2, count2: s.count1,
    pct1: s.pct2, pct2: s.pct1,
    hearts1: s.hearts2, hearts2: s.hearts1,
    laughs1: s.laughs2, laughs2: s.laughs1,
    bn1: s.bn2, bn2: s.bn1,
    jeTaime1: s.jeTaime2, jeTaime2: s.jeTaime1,
    avgWords1: s.avgWords2, avgWords2: s.avgWords1,
    maxConsec1: s.maxConsec2, maxConsec2: s.maxConsec1,
    maxConsecDate1: s.maxConsecDate2, maxConsecDate2: s.maxConsecDate1,
    opens1: s.opens2, opens2: s.opens1,
    closes1: s.closes2, closes2: s.closes1,
    questions1: s.questions2, questions2: s.questions1,
    fast1: s.fast2, fast2: s.fast1,
    earliest1: s.earliest2, earliest2: s.earliest1,
    latest1: s.latest2, latest2: s.latest1,
  };
}

// ═══ MAIN ═══
function generateBook(data) {
  const { messages, stats, name1, name2, keyMoments, nameMap, roseName } = data;
  // Dynamic colors: rose person gets ROSE, other gets BLUE
  const roseIs1 = (roseName === name1);
  const COLOR1 = roseIs1 ? ROSE : BLUE;       // color for name1
  const COLOR2 = roseIs1 ? BLUE : ROSE;       // color for name2
  const BG1 = roseIs1 ? ROSE_BG : BLUE_BG;
  const BG2 = roseIs1 ? BLUE_BG : ROSE_BG;
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, autoFirstPage: false, info: { Title: `Nos premiers mots — ${name1} & ${name2}`, Author: 'Nos premiers mots' } });
  doc.registerFont('Inter', path.join(FONTS_DIR, 'Inter.bin'));
  doc.registerFont('Playfair', path.join(FONTS_DIR, 'Playfair.bin'));
  doc.registerFont('Playfair-Italic', path.join(FONTS_DIR, 'Playfair-Italic.bin'));
  doc.registerFont('NotoEmoji', path.join(FONTS_DIR, 'NotoEmoji.bin'));

  // Check if name1 maps to s1 or s2 — if s1 maps to name2, we need to swap stats
  const s1DisplayName = nameMap[stats.s1] || stats.s1;
  const needsSwap = (s1DisplayName === name2);
  const orderedStats = needsSwap ? swapStats(stats) : stats;
  const colors = { c1: COLOR1, c2: COLOR2, bg1: BG1, bg2: BG2 };
  doc.addPage(); drawCover(doc, name1, name2, orderedStats, messages, colors);
  drawChapterTitle(doc, 'un', 'Nos premiers mots', 'Vos messages tels quels');
  drawConversation(doc, messages, name1, name2, nameMap, colors);
  drawChapterTitle(doc, 'deux', 'Notre histoire en chiffres', 'Les statistiques de votre couple');
  drawStatsOverview(doc, orderedStats, name1, name2, colors);
  drawFaceAFace(doc, orderedStats, name1, name2, colors);
  drawNotreHistoire(doc, orderedStats, name1, name2, colors);
  if (keyMoments?.length) drawTimeline(doc, keyMoments, name1, name2, nameMap, colors);
  drawEndPage(doc, name1, name2);
  return doc;
}

// ═══ NETLIFY HANDLER ═══
export default async function handler(req) {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  try {
    const body = await req.json();
    const { messages, stats, name1, name2, keyMoments } = body;
    if (!messages || !stats || !name1 || !name2) return new Response(JSON.stringify({ error: 'Données manquantes' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const nameMap = body.nameMap || { [stats.s1]: name1, [stats.s2]: name2 };
    const roseName = body.roseName || name2;
    const doc = generateBook({ messages, stats, name1, name2, keyMoments, nameMap, roseName });
    const chunks = [];
    return new Promise((resolve, reject) => {
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => { const buf = Buffer.concat(chunks); resolve(new Response(buf, { status: 200, headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="nos-premiers-mots-${name1.toLowerCase()}-${name2.toLowerCase()}.pdf"` } })); });
      doc.on('error', reject); doc.end();
    });
  } catch (err) { console.error('PDF error:', err); return new Response(JSON.stringify({ error: 'Erreur: ' + err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } }); }
}
export { generateBook };
