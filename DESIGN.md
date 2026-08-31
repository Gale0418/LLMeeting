---
name: LLMeeting
description: Holographic Dragon Command Deck for operating a private multi-AI debate.
colors:
  dark-metal: "#0a0b10"
  metal-blue: "#16182c"
  mirror-glass: "rgba(30, 32, 50, 0.45)"
  cyan-flow: "#00f2fe"
  violet-flow: "#8e75ff"
  amber-flow: "#ffbf69"
  text-primary: "#f0f3fa"
  text-secondary: "#9aa5b5"
  border-hairline: "rgba(255, 255, 255, 0.08)"
  danger: "#ff3b30"
  success: "#34c759"
typography:
  display:
    fontFamily: "'Segoe UI', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "normal"
  body:
    fontFamily: "'Segoe UI', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Segoe UI', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.violet-flow}"
    textColor: "{colors.text-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "12px 10px"
    height: "44px"
  button-secondary:
    backgroundColor: "rgba(255, 255, 255, 0.05)"
    textColor: "{colors.text-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "12px 10px"
    height: "44px"
  glass-panel:
    backgroundColor: "{colors.mirror-glass}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.xl}"
    padding: "16px"
  status-chip:
    backgroundColor: "rgba(255, 255, 255, 0.06)"
    textColor: "{colors.text-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "3px 8px"
---

# Design System: LLMeeting

## Overview

**Creative North Star: "Holographic Dragon Command Deck"**

LLMeeting v0.5.0 的介面採 Operate 模式：它是一座供使用者操控多 AI 議事流程的指揮甲板。暗黑金屬是穩定的艦橋結構，鏡面玻璃是承載表單、狀態與 transcript 的工作面；青藍、紫與琥珀只在流程、焦點與重要狀態需要被看見時流動。視覺可以有奇幻科技感，但每個控制仍要像熟悉的工具，掃一眼就能知道下一步。

三龍是甲板上的視覺守衛，而不是功能狀態的唯一載體：青藍龍守護協調與執行，紫龍守護互評與洞察，琥珀龍守護主席、總結與揭曉。龍的存在可以透過背景、徽記或狀態裝飾出現，但 provider 名稱、文字狀態、錯誤與操作結果始終獨立且可讀。流光是訊號，不是常駐噪音；玻璃是指定的工作面，不是把所有內容模糊化。

**Key Characteristics:**

- 暗黑金屬艦橋、鏡面玻璃工作面、青藍／紫／琥珀狀態流光
- 三龍作為可辨識但不取代文字的指揮層意象
- Operate 優先：狀態掃讀、明確操作、可追溯 transcript
- 靜態內容預設可讀；流動效果只表達執行、焦點、載入、揭曉或錯誤

## Colors

Palette character is dark metal with restrained holographic signals: cyan, violet, and amber are reserved for operational meaning, while provider brand colors remain secondary identifiers.

### Primary

- **紫色指揮流光** (`{colors.violet-flow}`): primary action、目前選取與主要焦點；不可塗滿所有 inactive controls。
- **青藍執行流光** (`{colors.cyan-flow}`): active／running、進度與協調中狀態。
- **琥珀揭曉流光** (`{colors.amber-flow}`): chair、summary、reveal 或需要使用者注意的決策結果。

### Secondary

- **金屬藍黑** (`{colors.metal-blue}`): 深色背景的次層 tonal field，將艦橋與內容工作面分開。

### Neutral

- **暗黑金屬** (`{colors.dark-metal}`): 主背景與低干擾空間。
- **鏡面玻璃** (`{colors.mirror-glass}`): transcript、狀態卡、設定與 diagnostics 的工作面；必須維持內容對比。
- **霜白文字** (`{colors.text-primary}`): 主要文字、按鈕與可讀內容。
- **霧灰文字** (`{colors.text-secondary}`): 輔助說明、標籤與非主動狀態；不可單獨承擔關鍵資訊。
- **髮絲邊界** (`{colors.border-hairline}`): 玻璃層的定位線，不與大陰影重複堆疊。

### Named Rules

**The Signal Rarity Rule.** 青藍、紫、琥珀是操作訊號；一個畫面只讓與當前任務有關的流光成為主角。

**The No-Color-Only Rule.** 任何 provider 或流程狀態都必須同時有文字、圖示／形狀或 aria 語意，不能只靠顏色或龍的姿態判讀。

## Typography

**Display Font:** `'Segoe UI', 'Noto Sans TC', system-ui, sans-serif`

**Body Font:** `'Segoe UI', 'Noto Sans TC', system-ui, sans-serif`

**Label/Mono Font:** System UI for labels; monospace is reserved for diagnostics and measured data only.

**Character:** 乾淨、略帶艦橋儀表感的系統無襯線，讓繁體中文在窄側邊欄仍有穩定字面與清楚的 UI 階層。標題靠重量與尺寸建立存在感，不用漸層文字或裝飾字體掩蓋操作語意。

### Hierarchy

- **Display** (700, 24px, 1.2): LLMeeting 品牌標題與甲板入口，不延伸成大幅行銷 hero。
- **Headline** (700, 15–18px, 1.3): 區塊標題與目前任務。
- **Title** (600–700, 13–15px, 1.4): provider、回合、summary 與按鈕文字。
- **Body** (400, 13px, 1.5): 問題、回答、提示與隱私說明；transcript 長文維持可讀行距。
- **Label** (600, 11–12px, 1.3): 狀態、欄位名稱、badge 與 diagnostics 摘要。

### Named Rules

**The Scan Before Drama Rule.** 任何流光、龍形或 motion 都不能降低第一眼辨識輸入、啟動、暫停、provider 狀態與 transcript 的速度。

## Layout

側邊欄是單欄 command deck，內容寬度以現有約 480px 上限為基準，內邊距與間距使用 4／8／12／16／24px 節奏。固定的閱讀順序是：品牌與流程狀態 → 問題輸入與主操作 → 可展開進階設定 → provider 狀態 → transcript → diagnostics／隱私說明。設定與互動控制採漸進揭露，不把所有控制塞在第一眼。

背景龍場景應位於甲板後方並讓工作面保持清楚；鏡面玻璃區塊以 tonal layering 分組，避免巢狀卡片堆疊。窄視窗下不縮小字體換取密度：五家 provider 的狀態可換成可換行或分段排列，transcript 保持直向閱讀且不得出現水平捲動。鍵盤焦點順序與視覺順序一致。

## Elevation & Depth

系統採「金屬底座＋鏡面玻璃＋有限環境光」的混合深度。底座靠深淺 tonal layer 分區，玻璃工作面靠半透明填色與細邊界定位；陰影只在可互動面浮起、focus 或重要揭曉時出現，必須有 offset 與柔和 blur。backdrop blur 僅用於確實需要把背景與內容分離的玻璃面，不能作為裝飾性濾鏡覆蓋文字。

### Shadow Vocabulary

- **Deck lift:** `0 4px 15px rgba(0, 0, 0, 0.2)`；用於 transcript／summary 等需要與金屬底座分離的工作面。
- **Signal focus:** `0 0 0 2px rgba(0, 242, 254, 0.35)`；只作 focus ring 的外圍訊號，仍需保留可見邊界。
- **No constant glow:** inactive surface 不使用零位移彩色光暈或無限發光動畫。

### Named Rules

**The One Elevation Rule.** 一個元件在同一狀態以邊界或陰影表達層級，不用寬邊框再疊硬陰影製造假卡片。

## Shapes

甲板工作面使用柔和但克制的 8／12／16px 圓角；小型 badge 可使用膠囊形，但大型容器不可全部變成 pill。按鈕、select、number input、textarea 與 details 控制共享相同的邊界、focus 與圓角語言。玻璃邊界採 1px 髮絲線，內容區不使用粗色邊線。錯誤以文字、圖示與狀態色共同表達，並保留足夠的內距與換行空間。

## Components

### Buttons

- **Shape:** 12px 圓角（`{rounded.lg}`），最小高度 44px，讓側邊欄觸控／鍵盤操作有足夠目標尺寸。
- **Primary:** 紫色指揮流光只用於當前主要動作；文字採霜白，padding `12px 10px`。
- **Hover / Focus:** 150–250ms tonal／border transition；focus-visible 必須有 ≥2px 外圍 ring，不能只靠 hover glow。
- **Secondary / Ghost:** 鏡面玻璃低對比填色與髮絲線；Reset、清除、暫停等動作依風險使用明確文字，不用只靠圖示。
- **Disabled / Loading / Error:** disabled 降低對比但保留可讀 label；loading 顯示文字狀態與穩定 skeleton／dots；錯誤說明問題與恢復方式。

### Status & Dragon Rail

provider status 保留 provider 名稱、目前狀態文字與可讀的 selected／active／error 語意。三龍可以成為頂部背景、狀態徽記或揭曉裝飾：青藍＝協調執行、紫＝互評洞察、琥珀＝主席揭曉，但不能一龍對應一個 provider，也不能取代文字狀態。Meta AI Beta 保留 Beta 標籤，與穩定 provider 清楚區分。

### Cards / Containers

- **Corner Style:** 12–16px，玻璃工作面最大 16px。
- **Background:** mirror-glass 只用於內容承載；金屬藍黑用於次層工具區。
- **Shadow Strategy:** 依 Elevation & Depth，只在需要浮起或 focus／summary 狀態使用。
- **Border:** 1px hairline；不使用粗色 left/right bar。
- **Internal Padding:** 12–16px，密集狀態格可使用 8–10px，但保留文字呼吸。

### Inputs / Fields

textarea、select 與 number input 是熟悉的原生語意控制，採深色金屬／玻璃填色、1px 邊界與 8px 圓角。focus-visible 使用清楚的青藍或紫色 ring；placeholder 對比不得低於可讀門檻。錯誤文字靠近欄位並說明如何修正，disabled 不以透明到難以辨識的方式處理。

### Navigation

側邊欄不引入獨立大導航；topbar 提供品牌、方案狀態、Reset 與清除紀錄，details／summary 負責進階設定、互動控制與 diagnostics 的漸進揭露。summary 必須可鍵盤操作，開合狀態可被輔助科技讀取。

### Transcript

transcript 是主要工作面，不是裝飾卡片：使用者、各 provider、互評 round、summary 與 reveal 必須能以文字順序追溯。bubble 形狀可協助掃讀，但不能裁切長文；loading、空狀態、服務狀態與錯誤皆提供穩定且可讀的內容。summary／reveal 的琥珀訊號只作層級提醒，正文仍維持一般文字對比。

## Do's and Don'ts

### Do:

- **Do** 讓青藍、紫、琥珀流光分別服務執行、互評／主操作與揭曉／注意狀態，並用文字同步說明。
- **Do** 保留三龍作為一致的視覺識別，讓背景圖或素材在低效能環境有靜態 fallback。
- **Do** 為每個互動元件定義 default、hover、focus-visible、active、disabled、loading、error 與 empty 狀態。
- **Do** 使用 `prefers-reduced-motion: reduce` 關閉流光、浮動與 reveal 動畫；內容與狀態在靜止畫面仍完整可讀。
- **Do** 控制玻璃 blur、陰影與背景動畫的面積與頻率，優先確保側邊欄滑動、輸入與 transcript 更新流暢。
- **Do** 讓動態狀態透過語意化文字／live region 傳達，並維持鍵盤 focus 可見與至少 4.5:1 的一般文字對比目標。

### Don't:

- **Don't** 用龍、顏色、動畫或 emoji 單獨表示 provider 身分、錯誤、完成或 Beta 狀態。
- **Don't** 把鏡面玻璃、backdrop blur、霓虹 glow 或漸層文字套到每個元件；流光是訊號，不是背景噪音。
- **Don't** 讓背景圖、特效、陰影或大量 DOM／動畫阻塞輸入、捲動與 transcript 閱讀；昂貴效果必須可降級或關閉。
- **Don't** 以自訂滾動條、奇怪表單控制或只靠 hover 的互動取代瀏覽器熟悉行為。
- **Don't** 把尚未通過自動驗證、登入態 Chrome 試玩或商店審核的 v0.5.0 目標描述成已發布事實。
