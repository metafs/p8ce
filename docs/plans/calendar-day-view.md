# Implementation Plan — カレンダーの「日ごと」表示

## Goal

`/calendar` を、Tanzbüro Berlin の Tanzkalender（https://www.tanzbuero-berlin.de/tanzkalender/）の構成を参考にした「日ごと」表示に改める。月の表は「月」表示として残す。見た目・言葉は `docs/design/ui.md` の決まり（無彩色、罫線、同じ大きさの行）に従う。

モック：claude.ai の Design キャンバス「p8ce カレンダー モック」（日ごと・月・スマートフォンの 3 画面）。

## Context

- 今の `/calendar` は月の表だけで、地域と種別で絞れる。
- Tanzkalender から取り入れるのは次の 5 つ。
  - 予定のある日だけ押せる日付の帯
  - 属性での絞り込み
  - 会場での絞り込み
  - 行を開くとほかの日程と会場が見える
  - 次のページ送り
- Tanzkalender にある「割引（Tanzcard）」「鑑賞サポート」「若い観客向け」「初演」は、p8ce の Event に項目がないため入れない。

## Requirement IDs

- REQ-DISCOVERY-001：カレンダーは Schedule の開催日だけを対象とする。Festival は子 Event を表示する
- REQ-DISCOVERY-002：地域は Schedule ごとに Venue から導く
- REQ-DISCOVERY-003：地域・種別・日付で絞り込む

## Acceptance Criteria

- [x] `/calendar` は既定で「日ごと」を開き、今日（東京）から並ぶ。`?from=YYYY-MM-DD` でその日から並ぶ
- [x] `?view=month&month=YYYY-MM` で「月」を開く。`?month=` だけの既存リンクも「月」を開く
- [x] 日付の帯：日曜はじまりの 4 週間を出し、前後の週へ移れる。予定のある日だけがリンクで、選んだ日と今日がわかる
- [x] 絞り込みは地域・種別・会場・無料のみ。GET フォームで、URL を共有できる
- [x] 行は開催日ごとに 1 行とする。同じ日の複数回は時刻を縦に並べて 1 行にまとめる
- [x] 行を開くと、ほかの日程・参加方法（料金）・会場・上演ページ・チケット／申込リンクが出る。JavaScript は使わない
- [x] 中止の Event は「中止」の枠線ラベルで残し、チケット／申込リンクは出さない
- [x] Festival 自体は行にならず、子 Event の行に「フェスティバル」として名前とリンクが付く
- [x] 20 行を目安に日の区切りで止め、「○○ 以降を表示」で次の日から始める
- [x] 月表示は 1 日 3 件まで出し、残りは「ほか N 件」とする。日付から日ごとへ移れる
- [x] 320px 幅で横スクロールが出ない（日付の帯は枠の中でスクロールする）

## Affected Areas

- `src/features/discovery/calendar.ts`：`resolveDay`、`weekStart`、`dateStrip`、`pageDays`
- `src/features/discovery/projection.ts`：`calendarEntries`、`calendarDayItems`、`isFreeOffers`、行の型。`calendarDays` は置き換える
- `src/features/discovery/queries.ts`：`listCalendarDays` が料金と申込リンクも読み、会場の一覧を返す
- `src/features/discovery/filters.ts`：`parseCalendarQuery`、`calendarHref`、`hasCalendarFilter`
- `src/features/discovery/components/calendar-page.tsx`：日ごと・月・絞り込み・行
- `src/ui/list-row.tsx`：`extra`（行の下の内容）
- `src/app/globals.css`：日付の帯、表示の切り替え、行の詳細、月のセル
- `docs/design/ui.md`：カレンダーの決まり

## Implementation Steps

1. 日付の計算を足す：`resolveDay`、`weekStart`、`dateStrip`、`pageDays`
2. カレンダー用の射影を作る：Festival を除く、地域・会場で Schedule を絞る、無料を判定する、日ごとにまとめる
3. クエリで料金（`event_ticket_offers`）と申込リンク（`event_ticket_links`）を `in` でまとめて読む
4. クエリ文字列の読み書き（`view` `from` `strip` `month` `prefecture` `type` `venue` `free`）を足す
5. 画面を組む：見出しと表示の切り替え、日付の帯、絞り込み、日ごとの行と詳細、ページ送り、月の表
6. CSS を足す。狭い画面とリスト幅（container query）で行の詳細を 1 列にする
7. テストと文書を更新する

## Data / Migration Plan

なし。既存のテーブルを読むだけ（料金と申込リンクは公開の Event ページと同じ読み方）。

## Security / Authorization

- 読むのは公開中の版だけ。RLS に任せ、Event ページと同じクライアントで読む
- 外部リンクは `rel="noreferrer"`・`target="_blank"` で開き、Event ページと同じ扱いにする
- `venue` は UUID の形だけ受け付け、ほかの値は捨てる

## Test Plan

- 単体：`calendar.test.ts`、`projection.test.ts`（Festival を除く、地域・会場の絞り込み、無料の判定、同じ日の複数回）、`filters.test.ts`
- E2E：`m5-public-discovery.spec.ts` に日ごと表示（Festival の子が出て Festival 自体は行にならない）を足した。`accessibility.spec.ts` に `/calendar?from=2030-07-03` を足した
- 目視：サンプルデータで 1440px と 390px を確認する

## Documentation Updates

- `docs/design/ui.md`：カレンダーの節と `ListRow.extra`

## Risks / Open Questions

- **1 Event を開催日ごとに出す：** カレンダーの規則として `ui.md` に書いた。「探す」の「1 Event は 1 回だけ」とは別の規則になる
- **種別は 1 つだけ選べる：** 今の `/events` と同じ。モックは複数選択だったが、共有の絞り込みの形を変えるため別に決める
- **「無料」の定義：** 料金がすべて `free` の Event とした。料金の登録がない Event は含めない
- **絞り込みは送信ボタンで反映する：** GET フォームのため、モックのように押してすぐは変わらない
- **読み込み量：** カレンダーは公開中の Event を全件読んで射影する（既存と同じ）。件数が増えたら期間で絞って読む
- **表示を確かめていない環境：** ローカルの Supabase が起動できず、E2E は未実行。単体テスト・型・lint・build は通っている

## Completion Criteria

- `pnpm check` と `pnpm build` が通る
- CI の E2E（`m5-public-discovery`、`accessibility`）が通る
- 受け入れ基準をプレビュー環境で目視確認する
