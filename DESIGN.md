---
name: LLMeeting
brand-glow: 名稱／方案／版本三標籤保留電流色填色，文字細描邊、徽章邊框與光暈使用代碼雨色；4.8秒輕微text-shadow及徽章box-shadow呼吸，不變動文字不透明度。狀態文字用代碼雨色呼吸，故障紅底保留並給狀態深色底；關閉背景／動畫、減少動效停止，隱藏暫停，不改連線進度色。
sunday-rainbow: 星期日每波既有電流animationend重抽七色主題，同步字碼雨與互補電流／品牌微光，不增加換色interval；其他工作日維持固定色。
provider-order: 預設英文字母A–Z；啟用先後為下一場順序，停用再啟用排最後，未啟用者置後。卡片／分頁／人設／裁判選單移動既有DOM而非僅改CSS，保留值與鍵盤焦點；進行中的會議沿用場次activeProviders順序，不因調整下一場選擇重排歷史。
health-diagnostics: 摘要常駐，歷史與技術細節分層展開；狀態與證據分開，不推測修復成功。
original-prompt-recovery: 故障卡可由使用者複製原提示，不重送；從送出前的完整原文取出，readonly展開區保留換行與字元，剪貼簿拒絕則選取供手動複製。每家只留當前階段，共600000字元，超額／舊場次無原文均明示不可還原，不猜測或默默截斷。
fault-pause: repairPause或致命error使吸頂列實心深紅並保留文字提示，歷史事件不影響樣式；暫停建立後一次定位仍待補入且網址相符的AI既有分頁，使用者可自由切頁，取消後不補做定位。
health-history: 沿用debugEvents、manualRepairs與departures，本機最多100筆合併事件；失去時間時明示，Intl顯示當地時間。只重畫文字與清單，不取代details節點，保留開關與捲動，不新增timer或重複live播報。
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

## 2026-10-14 交付體驗調整

最新使用者參考覆蓋前版低調沿邊電路方向：背景採滿版綠色字碼雨與十條橫跨視窗的發光電路。兩個字碼紋理層透過transform向下流動，路徑以多段dash同時移動；保留原有大龍及前景操作色彩。文字卡使用暗色遮罩，移除背景玻璃模糊使字碼可辨識；背景及動畫開關仍可獨立控制，減少動效停用、隱藏頁面暫停。只有靜態背景預覽完成，原生側欄與耗能尚未實測。

延續龍艦橋視覺，縮小裝飾場景並關閉常駐裝飾動畫。模型選擇之後直接放啟動／停止，進階設定隨後展開，讓新使用者更快找到主操作。會議紀錄採最長 72vh／760px 的獨立閱讀區；貼底時跟隨、往上閱讀時保留可見段落位置，提供跳到最新回覆與簡短輔助科技提示。未改動的回覆節點及已展開的原故障保留，互動按鈕至少 44px，輔助說明與互動控制文字至少 12px。窄側欄中英日實機排版仍需確認。

## 小劇場、抽卡與吸頂進度

進度航道移入既有 sticky topbar，以 38px 高度容納節點與階段標籤；標籤不依賴顏色辨識。等待發言保留已到達的階段，錯誤以當前階段與紅色邊界呈現，不標示為百分之百完成。

小劇場入口是空白草稿時的漸進展開，選擇只填題目與設定。挑戰選項採單欄、44px 以上的操作面；當使用者明確換牌，才以 220ms ease-out 與每張 28ms 的間隔短暫滑入。一般進度更新、長文閱讀保持穩定。選過的挑戰與成功複製使用幾何勾記及文字回饋；prefers-reduced-motion 時不播放抽卡動畫。

本輪參考 [Motion Reference](https://motion-reference.takayustudio.jp/) 的順次出場、按壓回饋，以及 [Lucian UX/UI Prompt](https://lucianlabs.dev/uxui-prompt/) 的複製成功狀態。採用互動概念，沒有安裝網站提供的套件或複製整套樣式。原生側欄渲染驗收仍待完成。

## Overview

**Creative North Star: "Holographic Dragon Command Deck"**

LLMeeting v0.5.0 的介面採 Operate 模式：它是一座供使用者操控多 AI 議事流程的指揮甲板。暗黑金屬是穩定的艦橋結構，鏡面玻璃是承載表單、狀態與 transcript 的工作面；青藍、紫與琥珀只在流程、焦點與重要狀態需要被看見時流動。視覺可以有奇幻科技感，但每個控制仍要像熟悉的工具，掃一眼就能知道下一步。

三龍保留原本金色素材，作為甲板上的視覺守衛，而不是功能狀態的唯一載體。青藍、紫、琥珀光譜用於介面訊號，不替三龍重新上色。provider 名稱、文字狀態、錯誤與操作結果始終獨立且可讀。流光是訊號，不是常駐噪音；玻璃是指定的工作面，不是把所有內容模糊化。

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

側邊欄是單欄 command deck，內容寬度以現有約 480px 上限為基準，內邊距與間距使用 4／8／12／16／24px 節奏。閱讀順序是：品牌與流程狀態 → 三龍與航道 → 問題輸入 → provider 控制與修復入口 → 可展開進階設定／互動控制 → 主操作 → transcript → diagnostics／隱私說明。provider 清單不另設伸縮功能；其他設定採漸進揭露。

背景龍場景應位於甲板後方並讓工作面保持清楚；鏡面玻璃區塊以 tonal layering 分組，避免巢狀卡片堆疊。約 320–480px 下五家 provider 以單一橫列近方形按鈕排列，不附角色副標；長錯誤另由修復區與診斷呈現。transcript 保持直向閱讀且不得出現水平捲動。鍵盤焦點順序與視覺順序一致。

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

provider status 保留 provider 名稱、目前狀態文字與可讀的 selected／active／error 語意；啟用使用 aria-pressed，readiness 為獨立維度。三龍與介面光譜不能取代文字狀態。Meta AI 按鈕不顯示 Beta 副標，以保持五家一致尺寸；支援限制仍於產品與商店文件誠實說明。

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

2026-10-14 使用者要求恢復大龍並加入晶片世界背景：龍舞台採 170–225px（窄幅158px），電路以六條固定視窗走線、低對比底線與青藍短流光呈現。背景與動畫可分別關閉；減少動態效果停動畫，頁面隱藏暫停。控制列移到舞台外，保持12px文字與44px點擊高度，不覆蓋龍。這是純裝飾，不宣稱代表AI思考或剩餘時間；320／480px原生側欄可讀性與耗能仍待實機確認。

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


### 2026-10-15 星期彩虹與電路流光

裝飾背景依本地週一至週日切換紅、橙、黃、綠、藍、紫、白；電路色相分別180、210、240、300、40、90、190度。週日白色無色相互補，使用青藍確保暗底可見。這些變數限於字碼與電路，不變更provider、操作、警告及文字色彩。字碼以既有原創SVG的alpha遮罩著色，保留滿版兩層移動與字元透明度層次。

電路採低對比細底線與每條一組柔光尾／亮段／亮頭，pathLength=1000統一相位；同一路線各光層共享時長與延遲，不同路線12–18秒錯開，偶數路線反向且調整亮頭位於前端。保留45度走線、圓角接點及晶片細節，避免密集等長亮段造成跑馬燈感。CSS動效可關閉，頁面隱藏及減少動效涵蓋所有光層；日期只設一個到本地午夜的timeout並在隱藏時清除。

研究僅採概念，未複製第三方元件或增加React/Motion依賴：Magic UI Animated Beam（底線/光束分離）、Robert Crocker Animated Circuit（沿線短光段）。已檢查七色320/480靜態背景圖；實際側欄的動態、閱讀對比與耗能仍待重載驗收。


### 2026-10-15 擴充功能偏好設定

語言、背景電路與電流動畫移至 manifest.options_ui 宣告的內嵌Chrome選項頁，open_in_tab=false。側欄專注會議與龍舞台，不再顯示三項控制，也不額外新增另一顆設定按鈕；入口使用Chrome原生圖示右鍵選項或擴充功能詳細資料。設定頁採獨立靜態深色表單：單欄、44px語言選單、48px核取選項、鍵盤焦點與三語原有標籤，不加裝飾背景。

偏好即改即存：語言以chrome.storage.onChanged同步各頁，背景沿用同extension origin的localStorage與storage事件，不搬遷或清除舊key。無表單控制的側欄仍啟用背景與星期控制器；跨頁語言更新重畫程式UI，保留人工草稿與AI原文。初始化讀取遇外部更新時，以較新事件為準，事件接收不寫回，destroy移除監聽。原生選項頁與側欄跨頁實機操作仍待重載確認。


### 2026-10-15 主流程整合與第 0 輪

保留迷因龍頭LOGO與原龍舞台。主流程為「輸入想法 → 選參與AI → 選填既有對話 → 啟動」；分頁指定區移出進階設定，獨立折疊於模型區與啟動列之間。移除獨立擷取／取消／草稿預覽控制與重複登入教學，把分頁分享說明放在對應折疊區內；模式、主席規則、人設、互動風格仍在進階設定，連線檢查與故障修復入口保留。

明確選取的啟用模型分頁在啟動時唯讀收集已載入且可辨識的使用者與AI對話，不碰未選分頁、不滾動載入、不抓側欄歷史。所有來源成功讀取後，才開始準備及送出AI工作。空白來源不是故障；有內容可無新補充開場，全部來源空且問題空才阻擋。60,000字元總預算超過則提示，不靜默裁切。原頁面仍在生成、登入牆、服務錯誤、已關閉／改站分頁與無法安全識別的對話均先停止，不略過後繼續送出。

第0輪保存為帶provider與訊息數的來源區塊及使用者補充，畫面與文字紀錄各顯示一次，第一輪提示分享同份引用背景；正常後續輪數保持原規則。總結模式保留來源摘要步驟，第0輪同時傳給其他參與AI，來源摘要失敗手動補齊後仍保留。分頁區收合不取消選擇，重新掃描保留未失效選擇；失效項保留供明確提示，而非默默換新分頁。AI原文保持段落與程式碼空白，作引用資料、不作程式操作指令；三語新增說明由Antigravity編寫。


### 2026-10-15 向下批次資料電路

十條走線皆由視窗頂端向下，保留少量45度轉折；外側走線靠近邊緣，增加卡片旁的可見區。取代原先12–18秒單短光點與反向傳輸，改為每9秒三段不同長度的封包，十條錯開最多1.8秒，批次之間保留共同空檔。每條路徑pathLength=1000、虛線週期2000，三層使用明確px位移，光頭與光尾前端對齊；提高底線與光段對比，不更改閱讀卡及龍舞台。

只使用既有SVG及CSS，無新增動畫計時器或依賴。關閉動畫與減少動效時顯示中段靜態封包，頁面隱藏暫停並保留相位。背景專用320/480靜態與9秒動態示意不代表Chrome原生側欄驗收；真正可見性、動畫執行與效能仍需重載確認。


同日隨機節奏修正：使用者要求取消整齊齊發。側欄初始化時，十條路線獨立抽取7–14秒週期與0–整週期負延遲，之後由CSS各自循環。每次重開重新抽取，並非每一幀或每次偏好變更重抽；無新增timer／animation事件監聽。覆蓋上一版固定9秒、集中1.8秒相位與全體共同空檔規則，各路線仍保留自己的批次間隔、向下方向與三層對齊。


### 2026-10-15 每波重新抽取與三語狀態完整性

覆蓋前版只於初始化抽取的規則：每條路線單次動畫的亮頭完成後，重新抽取7–14秒速度與0.5–4.5秒正延遲。以兩套等價keyframe名稱交替，三層一起重新開始，等待時隱藏光段；無強制layout flush或新增timer。隱藏、關閉動畫及減少動效不排新波，若完成事件剛好排在隱藏邊界，保留pending待恢復，destroy移除全部監聽。

狀態文字只對明確由程式產生的階段槽位遞迴翻譯，翻譯與原文還原同樣受深度限制。內層互評模板限制為輪次標籤，避免吞掉等待狀態、造成日文重排錯誤；整理與總結英文分開，減少反向匹配歧義。故障卡片只翻固定UI外殼與網頁原文說明，後接原文不變；普通AI文字、使用者訊息、第0輪來源、暱稱及details原故障保留。靜態與代表性動態組合批次稽核，原生Chrome動畫／排版尚待實機重載。


### 2026-10-16 進行中語言切換

修正條件分支未納入文案的漏洞，加入實際卡片渲染與locale event多次切換測試。切換時從latestState更新狀態文字、模型狀態、進度可及性文字、卡片、修復通知／診斷及手動補入標題；不重新跑會議、不重填輸入、不改會議state，finally解除語言重畫旗標並保留捲動。

故障卡片限定已知leading stage鏈最多四層，支援「收集 AI 回覆: …」與「[填入提示] …」等格式，僅翻UI階段，保留其後技術字串、原文證據及details原故障。匿名缺名fallback由程式建立時翻譯，實際使用者暱稱不翻。模型就緒統計用完整三參數模板，避免再把錯誤數量後綴當任意資料；連線標題只翻程式status、品牌保留。中英日自動化渲染檢查不代表原生側欄視覺驗收。


### 2026-10-16 隔離瀏覽器驗收與修復錯誤切換

新增tests/browser獨立Playwright工程，不併入一般npm test。每輪複製正式前端到output、只替換測試副本的service worker，使用真Chrome storage/runtime跨頁消息、阻擋HTTP(S)頁面請求，並在finally關閉本次瀏覽器。獨立頁面320/480與真正停靠Side Panel分開記錄；原生側欄清除viewport emulation、等待非零layout，核對不在普通tabs清單，避免把一般分頁或1280px模擬視窗說成原生排版。

實測補回覆提交失敗後的英→日切換，發現合併過的已翻譯訊息無法反向識別。以manualReplyStatusSources保存原始片段，所有補回覆狀態經同一setter更新；locale事件重新翻譯各片段，未知技術訊息仍保留。草稿、會議狀態及原故障不變。UI驗收不代表五家AI與正式背景流程端到端驗收。
