<div align="center">

# 📝 MCQ Practice

**A fast, offline-friendly quiz app for exam preparation.**
Randomized questions · Shuffled options · Passage sets · Resume anywhere

[![Live App](https://img.shields.io/badge/▶_Open_Live_App-2ea44f?style=for-the-badge)](https://silentassassin14.github.io/mcq-practice/index.html)
[![Android App](https://img.shields.io/badge/⬇_Download_Android_App-3DDC84?style=for-the-badge&logo=android&logoColor=white)](https://drive.google.com/file/d/1a-UV5E9MojZvuHuEheyBlLyqiWb4GjMV/view?usp=sharing)

![JavaScript](https://img.shields.io/badge/JavaScript-vanilla-F7DF1E?logo=javascript&logoColor=black)
![No backend](https://img.shields.io/badge/backend-none-blue)
![Hosting](https://img.shields.io/badge/hosted_on-GitHub_Pages-181717?logo=github)

</div>

---

## ✨ Features

| | |
|---|---|
| 🎲 **Randomized quizzes** | Questions and options are shuffled on every attempt, so you can't memorize positions. |
| 📖 **Passage sets** | Comprehension passages and data tables stay on screen beside their questions (side panel on desktop, pinned on mobile). Sets are never split when shuffled. |
| 🖼️ **Pictures** | Diagrams, graphs and figures in questions, in options, or shared by a whole passage. Tap a picture to zoom. |
| 🔁 **Retest wrong answers** | Finish a quiz, then practice only the questions you got wrong. |
| 💾 **Auto-save and resume** | Progress is saved after every step. Close the tab and continue later (saves expire after 30 days). |
| 📲 **Move progress between devices** | Share your quiz state as a short code or a **QR code** and continue on your phone or laptop. No account or server needed. |
| 🔍 **Searchable question bank** | Browse every question, search by text, and show or hide answers. |
| ⌨️ **Keyboard shortcuts** | Fully usable without a mouse (see below). |
| 📚 **Multiple quiz files** | Drop in any number of `.json` files. The app finds them automatically and remembers your last choice. |
| 📴 **Works offline** | Downloaded quiz files are cached in the browser. |

---

## 🚀 Quick start

### Use it
Open the **[live app](https://silentassassin14.github.io/mcq-practice/index.html)**, pick a quiz file, and press **Start Quiz**.
Android users can also install the **[app](https://drive.google.com/file/d/1a-UV5E9MojZvuHuEheyBlLyqiWb4GjMV/view?usp=sharing)**.

### Host your own copy
1. **Fork** this repository.
2. Go to **Settings → Pages**, choose branch `main` and folder `/ (root)`, then save.
3. Open `https://<your-username>.github.io/<repo-name>/`.
4. If you use a custom domain, set your details in `app.js`:
   ```js
   const GH = { owner: "your-username", repo: "your-repo", path: "", branch: "main" };
   ```

---

## ➕ Adding your own questions

1. Create a quiz file, for example `physics.json`, following the format below (or generate it with the [AI prompt](#-ai-prompt-convert-papers-or-notes-to-json)).
2. Upload it to the **`qp/`** folder of the repo.
3. Refresh the app. The new file appears in the file list, no code changes needed.

> **How files are discovered:** the app asks GitHub which `.json` files are in `qp/`. If that fails, it falls back to an optional `qp/files.json` list, then to `questions.json`.

### Repository layout

```text
mcq-practice/
├── index.html
├── app.js
├── README.md
└── qp/
    ├── oceanography.json      ← your quiz files
    ├── physics.json
    ├── files.json             ← optional manual list of files
    └── images/
        ├── q12.webp           ← pictures used by questions
        └── map-set.webp
```

### Question format

A quiz file is **one JSON array** that mixes two kinds of items.

<details open>
<summary><b>A. Plain question</b></summary>

```json
{
  "id": 1,
  "question": "Which of these is the SI unit of pressure?",
  "options": { "A": "Pascal", "B": "Joule", "C": "Newton", "D": "Watt" },
  "answer": "A"
}
```
</details>

<details>
<summary><b>B. Passage set</b> (one passage or table, several questions)</summary>

```json
{
  "group": "ocean-currents",
  "title": "Directions (Q1–2): Read the passage and answer the questions",
  "passage": "First paragraph.\n\nSecond paragraph.",
  "questions": [
    {
      "id": 2,
      "question": "What mainly drives the thermohaline circulation?",
      "options": { "A": "Wind stress", "B": "Differences in water density", "C": "Tides", "D": "Magnetism" },
      "answer": "B"
    },
    {
      "id": 3,
      "question": "Which current type is organised into large gyres?",
      "options": { "A": "Thermohaline", "B": "Deep-water", "C": "Wind-driven", "D": "Tidal" },
      "answer": "C"
    }
  ]
}
```
A set has no `id` of its own. Its questions continue the numbering.
</details>

<details>
<summary><b>C. Questions with pictures</b></summary>

```json
{ "id": 12, "question": "Identify the structure shown.", "image": "q12.webp",
  "options": { "A": "...", "B": "...", "C": "...", "D": "..." }, "answer": "B" }
```

Pictures as options:

```json
{ "id": 15, "question": "Which circuit diagram is correct?",
  "options": { "A": "", "B": "", "C": "", "D": "" },
  "optionImages": { "A": "q15-a.webp", "B": "q15-b.webp", "C": "q15-c.webp", "D": "q15-d.webp" },
  "answer": "C" }
```

- Put image files in `qp/images/`. Names use lowercase letters, digits and hyphens, ending in `.webp`, `.jpg` or `.jpeg`.
- Add `"imageAlt": "short description"` for accessibility.
- On a **set**, `"image"` shows in the passage panel.
- Tables and anything that can be typed as text should be written as text, not a picture.
</details>

### Rules checklist

- ✅ Every question has `id`, `question`, `options`, `answer`. IDs are unique and run `1, 2, 3 …` in file order.
- ✅ Options are exactly `"A"`, `"B"`, `"C"`, `"D"`, all different and non-empty (empty only for picture options).
- ✅ `answer` is one capital letter.
- ✅ Valid JSON: double quotes, no trailing commas, no comments, UTF-8.
- ✅ Plain text only. Use Unicode like `m²`, `₹`, `°C`, `→`. Line break is `\n`, quote is `\"`.
- ❌ Never write "All of the above" or "Both A and B". Options are shuffled, so these break.
- ❌ Don't start options with `A.` or `(a)`. The app adds letters itself.

### Tables

Any line starting with `|` becomes a table, in both `passage` and `question`:

```json
"passage": "Readings at two stations.\n\n| Station | Temp (°C) | Salinity (psu) |\n|---|---|---|\n| S1 | 28 | 34 |\n| S2 | 24 | 35 |\n\nNote: psu = practical salinity unit."
```

Keep the same number of columns in every row and leave a blank line before and after the table.

### Common exam patterns

| In the paper | How to write it |
|---|---|
| Passage with Q1–Q5 | Passage set. Directions in `title`, text in `passage`. |
| One data table, several questions | Passage set. Table goes in `passage`. |
| Match List I with List II | Plain question. Table in `question`, options like `"A-2, B-1, C-4, D-3"`. |
| Arrange in correct order | Plain question. Items on separate lines (`\n`), options are sequences. |
| Statement I / Statement II, Assertion / Reason | Plain question. One statement per line, full-text options. |

📄 The complete reference, including common mistakes, is in [`question_bank_guidelines.md`](question_bank_guidelines.md).

---

## 🤖 AI prompt: convert papers or notes to JSON

Don't want to write JSON by hand? Paste this prompt into any AI assistant (Claude, ChatGPT, Gemini, etc.), then paste your question paper **or your study notes** at the very end. It returns a ready-to-use quiz file.

1. Copy the prompt below.
2. Replace the last line with your content.
3. Save the AI's reply as `something.json` and upload it to `qp/`.
4. If your questions have figures, create the `.webp` files with the exact names the AI used and put them in `qp/images/`.

<details>
<summary><b>📋 Click to open the copy-paste prompt</b></summary>

```text
Convert the question paper below into ONE JSON file for my quiz app.

FILE
- A single JSON array [ ]. Valid JSON: double quotes, no trailing commas, no comments.
- Items are either PLAIN questions or PASSAGE SETS, in the same order as the paper.

EVERY QUESTION (plain, or inside a set) has these four required fields:
  "id": integer, unique, 1,2,3... in file order (sub-questions inside sets continue the numbering)
  "question": string
  "options": object with exactly the keys "A","B","C","D", each a string
             (do NOT start an option with "A." or "(a)")
  "answer": one capital letter "A"-"D". Exactly one correct answer.
Options must be non-empty, EXCEPT an option that is itself a picture (see PICTURES), which is "".
Optional picture fields ("image", "optionImages") are allowed ONLY where the paper really has a figure. No other fields.

PICTURES
Use a picture only for things that cannot be written as text: diagrams, graphs, maps, circuits, figures, photos.
Data tables and anything readable as text must be typed out as text or a | table, never as a picture.
I will create the image files myself, so you only write the file names, using these exact rules:
- Figure belonging to one question: "image": "q<id>.webp"            e.g. "q12.webp"
- Pictures as options: "optionImages": {"A":"q<id>-a.webp","B":"q<id>-b.webp", ...} using only the letters that are pictures, and "" as the text of those options
- Figure shared by a whole passage set: put "image": "<group>.webp" on the SET itself (not inside its questions),
  e.g. "map-set.webp". A set must still have passage text, so if there is only a figure write a short line such as "Study the figure and answer the questions."
- File names: lowercase letters, digits and hyphens only, always ending in .webp. No spaces, no folders, no URLs, no capitals.
- Optional "imageAlt": one short sentence describing the figure, only if you can see it clearly. Otherwise leave it out.
- Never describe a figure with ASCII art, and never drop a question just because it has a figure.

PLAIN QUESTION:
{ "id": 1, "question": "...", "options": {"A":"...","B":"...","C":"...","D":"..."}, "answer": "B" }

PLAIN QUESTION WITH A FIGURE:
{ "id": 12, "question": "Identify the structure shown in the figure.", "image": "q12.webp", "options": {"A":"...","B":"...","C":"...","D":"..."}, "answer": "B" }

QUESTION WHOSE OPTIONS ARE PICTURES:
{ "id": 15, "question": "Which circuit diagram is correct?", "options": {"A":"","B":"","C":"","D":""},
  "optionImages": {"A":"q15-a.webp","B":"q15-b.webp","C":"q15-c.webp","D":"q15-d.webp"}, "answer": "C" }

PASSAGE SET (use it when several questions share one passage, one data table or one figure):
{
  "group": "short-unique-name",
  "title": "Directions (Q1-5): Read the passage and answer the questions",
  "passage": "Passage text. Write it ONCE.",
  "image": "short-unique-name.webp",
  "questions": [ { "id": 2, "question": "...", "options": {...}, "answer": "C" }, ... ]
}
A set has no "id". "image" on a set is optional. "group" is lowercase letters, digits and hyphens, unique in the file.
Do not put "group" or "passage" inside its questions. A question inside a set may have its own "image" or "optionImages" only if it has its own figure.

TEXT RULES
- Plain text only (no HTML). Use Unicode for math and symbols: m², ₹, °C, →.
- Line breaks inside strings are \n. Escape double quotes as \".
- Tables: each row on its own line starting with |, second line |---|---|, same number of
  columns in every row, a blank line before and after, written as \n inside the string.
  Use this for data tables (put them in "passage") and for match-the-following tables
  (put them in "question"; options are codes such as "A-2, B-1, C-4, D-3").
- Options are shuffled by the app: never write "All of the above", "Both A and B",
  or refer to option letters in the question or in another option.
- For arrange-in-order questions, put the items on separate lines (\n) in the question.

ANSWER LENGTH HEURISTIC (balance option lengths)
- The correct option must NOT be noticeably longer or more detailed than the wrong options.
- Keep all four options of a question close in length, wording style and level of detail, so the correct answer cannot be guessed from its length.
- Do NOT add extra explanation, qualifiers or detail to the correct option to make it "more complete".
- If the paper's original options differ a lot in length, keep their meaning and the correct answer unchanged, but tighten the longest option or lightly expand the shortest ones (without adding new facts) so the four look balanced.
- Never change which option is correct, and never change the factual content of an option; only adjust its length and phrasing.
- Do not apply this to options that are naturally short (numbers, names, years, single words, option codes like "A-2, B-1, C-4, D-3").

INPUT TYPE (question paper OR notes)
- First, decide what I pasted below:
  (a) A QUESTION PAPER: it already contains questions (usually with options and/or answers). Convert it exactly as described above, keeping the questions, options and answers from the paper.
  (b) NOTES / STUDY MATERIAL: it contains no ready-made questions (only facts, topics, explanations, or a chapter). In this case, create the questions and answers yourself from the notes.
- If it is a mix, convert the existing questions as they are and create new questions only for the parts that are notes.
- When creating questions from notes:
  - Base every question and answer ONLY on facts in the notes. Do not add outside facts or guess.
  - Cover all the important points of the notes as evenly as possible; skip trivial details.
  - Write clear, exam-style multiple-choice questions with exactly four options and exactly one correct answer.
  - Make the three wrong options believable (related terms, close values, common confusions), never silly or obviously wrong.
  - Do not repeat the same question in different words.
  - Spread the correct answers across A, B, C and D instead of favouring one letter.
  - If the notes contain a passage, data table or figure that several questions depend on, use a PASSAGE SET as described above.
  - Apply the ANSWER LENGTH HEURISTIC to the options you create.
- If I mention a number of questions, create exactly that many; otherwise create as many as the notes reasonably support.
- Do not tell me which type it was and do not add any explanation. All the same FILE, PICTURES and TEXT RULES apply, and the output is still only the JSON.

Return only the JSON. Do not add a list of images; the file names follow the rules above.

QUESTION PAPER OR NOTES:
<paste the questions and answers here, or paste the notes>
```

</details>

> 💡 **Tip:** to get a fixed number of questions from notes, add a line such as `Create exactly 30 questions.` just before the last line of the prompt.

---

## ⌨️ Keyboard shortcuts

| Key | Action |
|---|---|
| `A` `B` `C` `D` | Select that option |
| `↑` `↓` | Move between options |
| `Enter` / `Space` | Submit answer, then go to next question |
| Any key | Close a zoomed picture |

---

## 📲 Continue on another device

1. On device 1, during a quiz, press **Share quiz** to get a code and a QR code.
2. On device 2, open the **same quiz file**, press **Enter code**, then paste the code or scan the QR.
3. You continue from the exact question you left.

Everything happens in the browser. No data is sent to any server.

---

## 🛠️ Tech notes

- Plain HTML, CSS and JavaScript. No framework, no build step, no backend.
- Progress, caches and settings live in `localStorage`.
- Image names are validated, and only safe file names or `https://` links are accepted. A bad picture is skipped with a warning and never breaks the quiz.
- Problems in a quiz file are reported by item number instead of failing silently.

---

## 🤝 Contributing

Found a wrong answer or a typo in a question? Open an **issue** or send a **pull request** against the relevant file in `qp/`.

---

<div align="center">

Made for learners who like to practice smart. ⭐ Star the repo if it helps you!

</div>
