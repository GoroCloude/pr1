interface SubmissionData {
  name: string;
  address: string;
  license: string;
}

function handleSubmit(event: Event): void {
  event.preventDefault();

  const name = (document.getElementById("name") as HTMLInputElement).value;
  const address = (document.getElementById("address") as HTMLInputElement).value;
  const license = (document.getElementById("license") as HTMLInputElement).value;

  const data: SubmissionData = { name, address, license };

  const output = document.getElementById("output")!;
  output.innerHTML = `
    <h3>Submitted Data:</h3>
    <p><strong>Name:</strong> ${data.name}</p>
    <p><strong>Adresse:</strong> ${data.address}</p>
    <p><strong>Lizenz:</strong> ${data.license}</p>
  `;
}

document.getElementById("dataForm")!.addEventListener("submit", handleSubmit);
