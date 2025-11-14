<!DOCTYPE html>
<html lang="de">
<body style="background:#0f0f14; color:white; padding:2rem; font-family:Arial;">

<h1>Student Dashboard</h1>
<p>Hier kommt später das XP-Levelsystem.</p>

<button onclick="logout()">Logout</button>

<script>
if(!localStorage.getItem("role")) location.href="login.html";
function logout(){ localStorage.clear(); location.href="login.html"; }
</script>

</body>
</html>
