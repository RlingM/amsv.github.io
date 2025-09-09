const users = {
  "student": "password123",
  "researcher": "abc456"
};

let staffData = [];

function login() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  if(users[username] && users[username] === password) {
    alert("Login successful!");
    document.querySelector('.login-section').style.display = 'none';
    document.querySelector('.file-upload').style.display = 'block';
    document.querySelector('.search-section').style.display = 'block';
  } else {
    alert("Invalid credentials!");
  }
}

document.getElementById('excelFile').addEventListener('change', handleFile, false);

function handleFile(e) {
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = function(e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, {type:'array'});
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    staffData = XLSX.utils.sheet_to_json(firstSheet);
    displayStaff(staffData);
  };
  reader.readAsArrayBuffer(file);
}

function displayStaff(data) {
  const container = document.getElementById('staffList');
  container.innerHTML = '';
  for(let i = 0; i < data.length; i+=2) {
    const staff1 = data[i];
    const staff2 = data[i+1];
    
    const card1 = createStaffCard(staff1);
    container.appendChild(card1);
    
    if(staff2) {
      const card2 = createStaffCard(staff2);
      container.appendChild(card2);
    }
  }
}

function createStaffCard(staff) {
  const div = document.createElement('div');
  div.className = 'staff-card';
  div.innerHTML = `
    <img src="images/${staff.Photo}" alt="${staff.Name}">
    <h3>${staff.Name}</h3>
    <p><strong>Contact:</strong> ${staff.Contact}</p>
    <p><strong>Research:</strong> ${staff.Research}</p>
    <p><strong>Papers:</strong> ${staff.Papers}</p>
  `;
  return div;
}

function searchStaff() {
  const keyword = document.getElementById('searchInput').value.toLowerCase();
  const filtered = staffData.filter(s => 
    s.Name.toLowerCase().includes(keyword) ||
    s.Research.toLowerCase().includes(keyword) ||
    s.Papers.toLowerCase().includes(keyword)
  );
  displayStaff(filtered);
}

