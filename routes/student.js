<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <title>Temple of Logic – Schüler</title>

    <style>
        body {
            background: #0f0f14;
            color: #f5f5f5;
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 2rem;
        }

        h1, h2, h3 {
            color: #80f0d0;
        }

        .box {
            background: #14141c;
            padding: 1.5rem;
            margin-bottom: 2rem;
            border-radius: 10px;
            box-shadow: 0 0 12px rgba(0,0,0,0.5);
        }

        .logout {
            background: #6a4df4;
            color: white;
            padding: 0.6rem 1rem;
            border: none;
            border-radius: 6px;
            cursor: pointer;
        }

        .character-img {
            width: 160px;
            border-radius: 10px;
            border: 2px solid #80f0d0;
            margin-bottom: 1rem;
        }

        .list-item {
            padding: 0.5rem;
            background: #1b1b24;
            border-radius: 6px;
            margin-bottom: 0.4rem;
        }

        a {
            color: #80f0d0;
        }
    </style>
</head>

<body>

<h1>Tempel der Logik – Schülerbereich</h1>
<button class="logout" onclick="logout()">Logout</button>

<div id="loading">Lade Daten…</div>

<div id="content" style="display:none;">

    <!-- CHARAKTER -->
    <div class="box">
        <h2>Dein Charakter</h2>
        <img id="character-img" class="character-img">
        <h3 id="character-name"></h3>
    </div>

    <!-- XP -->
    <div class="box">
        <h2>Dein Fortschritt</h2>
        <p><strong>XP:</strong> <span id="xp"></span></p>
        <p><strong>Höchste XP:</strong> <span id="highest-xp"></span></p>
    </div>

    <!-- TRAITS -->
    <div class="box">
        <h2>Deine Eigenschaften</h2>
        <div id="traits-list"></div>
    </div>

    <!-- ITEMS -->
    <div class="box">
        <h2>Deine Ausrüstung</h2>
        <div id="items-list"></div>
    </div>

    <!-- UPLOADS -->
    <div class="box">
        <h2>Deine Uploads</h2>
        <div id="uploads-list"></div>
    </div>

</div>


<script>
// ---------------------------------------------------------
// LOGIN-CHECK
// ---------------------------------------------------------
if (localStorage.getItem("role") !== "student") {
    location.href = "login.html";
}

const userId = localStorage.getItem("id");

function logout() {
    localStorage.clear();
    location.href = "login.html";
}

// URL Fixer
function fixUrl(url) {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    return window.location.origin + url;
}

// ---------------------------------------------------------
// FIRST LOGIN → TRAITS / ITEMS / CHARACTER erzeugen
// ---------------------------------------------------------
async function firstLogin() {
    await fetch("/api/student/first-login", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ user_id: userId })
    });
}

// ---------------------------------------------------------
// EIGENE DATEN LADEN
// ---------------------------------------------------------
async function loadMe() {
    const r = await fetch(`/api/student/me/${userId}`);
    const data = await r.json();

    // Charakter
    if (data.character) {
        document.getElementById("character-img").src = fixUrl(data.character.image_url);
        document.getElementById("character-name").innerText = data.character.name;
    } else {
        document.getElementById("character-name").innerText = "Kein Charakter gefunden";
    }

    // XP
    document.getElementById("xp").innerText = data.xp;
    document.getElementById("highest-xp").innerText = data.highest_xp;

    // Traits
    const traitsBox = document.getElementById("traits-list");
    traitsBox.innerHTML = "";
    data.traits.forEach(t => {
        traitsBox.innerHTML += `<div class="list-item">${t}</div>`;
    });

    // Items
    const itemsBox = document.getElementById("items-list");
    itemsBox.innerHTML = "";
    data.items.forEach(i => {
        itemsBox.innerHTML += `<div class="list-item">${i}</div>`;
    });
}

// ---------------------------------------------------------
// UPLOADS LADEN
// ---------------------------------------------------------
async function loadUploads() {
    const r = await fetch(`/api/student/uploads/${userId}`);
    const uploads = await r.json();

    const box = document.getElementById("uploads-list");
    box.innerHTML = "";

    if (uploads.length === 0) {
        box.innerHTML = "<p>Noch keine Uploads.</p>";
        return;
    }

    uploads.forEach(u => {
        box.innerHTML += `
            <div class="list-item">
                <a href="${fixUrl(u.file_url)}" target="_blank">Bild öffnen</a>
            </div>
        `;
    });
}

// ---------------------------------------------------------
// INIT
// ---------------------------------------------------------
(async () => {
    await firstLogin();
    await loadMe();
    await loadUploads();

    document.getElementById("loading").style.display = "none";
    document.getElementById("content").style.display = "block";
})();
</script>

</body>
</html>
