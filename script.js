const API_BASE_URL = 'https://api.balintkiss.hu';

// === Szenzor adatainak frissítése ===
async function fetchData() {
  try {
    const response = await fetch('https://api.thingspeak.com/channels/2875631/feeds.json?results=1');
    const data = await response.json();
    const lastEntry = data.feeds[0];
    const temp = parseFloat(lastEntry.field1);
    const humidity = parseFloat(lastEntry.field2);


    document.getElementById('temperature').innerText = temp + " °C";
    document.getElementById('humidity').innerText = humidity + " %";

    let overallStatus = "";
    let statusClass = "normal";

    if (temp > 30) {
      overallStatus += "🔥 Meleg van! ";
      statusClass = "high";
    } else if (temp < 18) {
      overallStatus += "❄️ Hideg van! ";
      statusClass = "low";
    }

    if (humidity > 60) {
      overallStatus += "💦 Magas a páratartalom! ";
      statusClass = "high";
    } else if (humidity < 30) {
      overallStatus += "💨 Száraz a levegő! ";
      statusClass = "low";
    }

    if (overallStatus === "") {
      overallStatus = '<i class="fas fa-circle-check" style="color: lightgreen;"></i> Megfelelő környezet';
      statusClass = "normal";
    }

    const statusEl = document.getElementById("overall-status");
    statusEl.innerHTML = overallStatus;
    statusEl.className = "status " + statusClass;
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}
setInterval(fetchData, 5000);
fetchData();

// === "Tovább" gombhoz tartozó toggleCharts függvény ===
function toggleCharts() {
  const chartsDiv = document.getElementById("charts");
  const button = document.querySelector(".more-btn");

  if (chartsDiv.style.display === "none" || chartsDiv.style.display === "") {
    chartsDiv.style.display = "block";
    chartsDiv.style.opacity = "0";
    setTimeout(() => {
      chartsDiv.style.opacity = "1";
    }, 50);
    button.innerHTML = '<i class="fas fa-times"></i> Bezár';
  } else {
    chartsDiv.style.opacity = "0";
    setTimeout(() => {
      chartsDiv.style.display = "none";
    }, 300);
    button.innerHTML = '<i class="fas fa-chart-line"></i> Tovább';
  }
}

// === Admin modal, login és panel kezelése ===
function openAdminModal() {
  document.getElementById('adminModal').style.display = 'block';
  renderModalContent();

  // 🔥 Mindig friss állapot lekérése, ha már be vagyunk jelentkezve
  if (sessionStorage.getItem('admin') === 'true') {
    fetchSmartPlugStatus();
  }
}

function closeAdminModal() {
  document.getElementById('adminModal').style.display = 'none';
}

function renderModalContent() {
  const modalBody = document.getElementById('modal-body');

  if (sessionStorage.getItem('admin') === 'true') {
    modalBody.innerHTML = `
      <h2>Admin Panel</h2>
      <div class="smart-plug-toggle">
        <div id="wifiStatus" class="smart-plug-status off">Wifi kikapcsolva</div>
        <label class="switch">
          <input type="checkbox" id="smartPlugToggle">
          <span class="slider"></span>
        </label>
        <span id="smartPlugStatus">Ki</span>
      </div>

      <button onclick="logoutAdmin()" class="logout-btn">Kijelentkezés</button>
    `;

    // DOM betöltés után (ez garantálja, hogy léteznek már a toggle elemek)
    setTimeout(() => {
      const toggle = document.getElementById('smartPlugToggle');
      if (toggle) {
        toggle.addEventListener('change', () => {
          toggleSmartPlug(toggle.checked);
        });
      }

      // 🎯 Backend állapot lekérése mindig frissen
      fetchSmartPlugStatus();
    }, 0);
  } else {
    modalBody.innerHTML = `
      <h2>Admin bejelentkezés</h2>
      <form id="modalLoginForm">
        <input type="text" id="modalUsername" placeholder="Felhasználónév" required>
        <input type="password" id="modalPassword" placeholder="Jelszó" required>
        <button type="submit">Bejelentkezés</button>
        <div class="error" id="modalError"></div>
      </form>
    `;
    document.getElementById('modalLoginForm').addEventListener('submit', function(e) {
      e.preventDefault();
      const username = document.getElementById('modalUsername').value;
      const password = document.getElementById('modalPassword').value;

      fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      })
      .then(response => response.json())
      .then(data => {
        if (data.message === 'Sikeres bejelentkezés') {
          sessionStorage.setItem('admin', 'true');
          renderModalContent(); // újratölti az admin panelt
        } else {
          document.getElementById('modalError').textContent = data.message || 'Hiba történt a bejelentkezés során.';
        }
      })
      .catch(error => {
        console.error('Hiba a bejelentkezés során:', error);
        document.getElementById('modalError').textContent = 'Hiba történt a bejelentkezés során.';
      });
    });
  }
}

// === Smart plug toggle kezelés MongoDB-vel ===
function toggleSmartPlug(isOn) {
  const statusText = document.getElementById('smartPlugStatus');
  const wifiStatus = document.getElementById('wifiStatus');

  statusText.innerText = isOn ? "Be" : "Ki";
  wifiStatus.innerText = isOn ? "Wifi bekapcsolva" : "Wifi kikapcsolva";
  wifiStatus.className = 'smart-plug-status ' + (isOn ? 'on' : 'off');

  fetch(`${API_BASE_URL}/api/smartplug`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // 🔥 EZ KÜLDI A SESSION COOKIE-T
    body: JSON.stringify({ isOn })
  })
  .then(response => response.json())
  .then(data => {
    console.log("Smart plug válasz:", data);
    updatePlugUI(data.isOn); // GUI is frissül az új állapottal
  })  
  .catch(error => console.error("Hiba a smart plug váltásakor:", error));
}

function fetchSmartPlugStatus() {
  const wifiStatus = document.getElementById('wifiStatus'); // 💡 Ezt ide be kell tenni!
  if (wifiStatus) {
    wifiStatus.innerText = 'Állapot lekérése...';
    wifiStatus.className = 'smart-plug-status loading';
  }

  fetch(`${API_BASE_URL}/api/smartplug`, {
    credentials: 'include'
  })
    .then(response => response.json())
    .then(data => {
      updatePlugUI(data.isOn);
    })
    .catch(error => {
      console.error('Nem sikerült lekérdezni a smart plug állapotát:', error);
      if (wifiStatus) {
        wifiStatus.innerText = 'Hiba az állapot lekérésekor';
        wifiStatus.className = 'smart-plug-status error';
      }
    });
}

function updatePlugUI(isOn) {
  const toggle = document.getElementById('smartPlugToggle');
  const statusText = document.getElementById('smartPlugStatus');
  const wifiStatus = document.getElementById('wifiStatus');

  if (toggle) toggle.checked = isOn;
  if (statusText) statusText.innerText = isOn ? "Be" : "Ki";
  if (wifiStatus) {
    wifiStatus.innerText = isOn ? "Wifi bekapcsolva" : "Wifi kikapcsolva";
    wifiStatus.className = 'smart-plug-status ' + (isOn ? 'on' : 'off');
  }
}

function logoutAdmin() {
  fetch(`${API_BASE_URL}/logout`, {
    method: 'POST',
    credentials: 'include'
  })
  .then(response => response.json())
  .then(data => {
    sessionStorage.removeItem('admin');
    closeAdminModal();
  })
  .catch(error => console.error('Kijelentkezési hiba:', error));
}

window.onclick = function(event) {
  const modal = document.getElementById('adminModal');
  if (event.target === modal) {
    closeAdminModal();
  }
};

// === Cookie banner ===
function checkCookiePermission() {
  if (navigator.userAgent.includes('Chrome') && !localStorage.getItem('cookiesAccepted')) {
    document.getElementById('cookie-banner').style.display = 'block';
  }
}

function acceptCookies() {
  localStorage.setItem('cookiesAccepted', 'true');
  document.getElementById('cookie-banner').style.display = 'none';
  location.reload(); // újratöltés, hogy a session is újra próbálkozzon
}

window.onload = checkCookiePermission;

