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

1. Create a quiz file, for example `physics.json`, following the format below.
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

📄 The complete reference, including common mistakes and a **ready-to-paste AI prompt** that converts question papers or notes into valid JSON, is in [`question_bank_guidelines.md`](question_bank_guidelines.md).

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
