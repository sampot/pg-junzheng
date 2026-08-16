# 三國一郡（pg-junzheng）

十二回合節點領土 SLG。玩家每回合頒布三道政令，在七城蜀道圖上屯田、徵兵、築城、移軍、出征與偵察，選擇攻取成都或固守漢中。

## 執行

本遊戲是無 build、無套件依賴的純 HTML／CSS／JavaScript Playgrounds SAM。

```sh
python3 -m http.server 4173
```

開啟 <http://localhost:4173>。

## 測試

```sh
npx vitest run
```

測試工具只由 `npx` 臨時執行；不要安裝或提交 `node_modules`。

## 如何玩

1. 在大廳選擇「攻城」或「守郡」劇本與敵軍難度。
2. 點地圖上的我方城市，再選政令。每回合最多三令。
3. 移軍與出征只能前往相鄰城且消耗糧；糧道斷絕會降低士氣，低士氣造成逃兵。
4. 點「擊鼓揭示」讓敵我命令一次結算，並閱讀戰報。
5. 攻城需在十二回合內奪取成都；守郡需讓漢中撐過十二回合。

戰功、解鎖與設定分別透過 `/api/kv/junzheng:best`、`junzheng:unlocks`、`junzheng:settings` 保存。靜態預覽無 KV API 時仍可遊玩。

## 授權

程式碼採 MIT 授權。第三方美術、音效、音樂與字型見 [ATTRIBUTION.md](./ATTRIBUTION.md)。
