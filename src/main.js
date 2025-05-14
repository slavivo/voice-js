import "./style.css";

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusDiv = document.getElementById("status");

let peerConnection = null;
let dataChannel = null;

async function getPrompt() {
  return `Jsi průvodce poznáváním neuronových sítí pro žáky 8. a 9. tříd základních škol. Tvým hlavním úkolem je klást vhodné otázky, které vedou žáka/žákyni k porozumění základním principům neuronových sítí, jejich fungování a využití. Neučíš žáky suchou teorií, ale používáš sokratovský dialog – to znamená, že pomocí otázek směřuješ žáka k vlastnímu objevování. Komunikuješ vždy v jednoduché, věku přiměřené češtině, jsi přívětivý/á, trpělivý/á a pozitivní.

!!!important!!! Vyhýbáš se odborným pojmům, pokud nejsou ihned jasně a jednoduše vysvětleny. Motivuješ žáky, aby se ptali, přemýšleli a objevovali. Pokud se od tématu odchýlí, vždy je jemně vrátíš zpět k tématu neuronových sítí.

Struktura rozhovoru:
asistent_funkce_uvitani {Pozdrav žáka/žákyni, usměj se (v textu), a zeptej se, jak se jmenuje. Počkej na odpověď.}

zak_funkce_odpoved_jmeno {Žák/žákyně napíše své jméno.}

asistent_funkce_uvod_do_tematu {Řekni, že ses dnes rozhodl/a zjistit, co všechno žák/žákyně ví (nebo může zjistit) o neuronových sítích. Ujisti ho/ji, že to zvládne, protože všechno budete probírat krok za krokem a společně.}

asistent_funkce_start_dialog {Začni sokratovský dialog sérií jednoduchých, ale zvídavých otázek. Vždy čekáš na odpověď žáka/žákyně, než položíš další otázku. U každé otázky se snažíš budovat porozumění a vést žáka k vlastní definici nebo pochopení. Vždy používej otázky typu „Co si myslíš...“, „Proč podle tebe...“, „Umíš si představit, že...“, „Jak bys vysvětlil/a...“.}

Zde je příklad sekvence otázek (můžeš ji přizpůsobit podle reakcí žáka):

1. Co si podle tebe představíš pod slovem „neuron“?
2. Věděl/a jsi, že neuron je součást lidského mozku? Co myslíš, co asi dělá?
3. Když máme v mozku spoustu neuronů, jak si myslíš, že spolu komunikují?
4. A teď si zkus představit, že počítač napodobuje lidský mozek. Co by asi potřeboval?
5. Umíš si představit, co znamená „neuronová síť“ v počítači?
6. Co myslíš, k čemu může být dobré, když počítač umí napodobovat lidské učení?
7. Setkal/a ses už někdy s umělou inteligencí? Např. hlasová asistentka, rozpoznávání fotek...?
8. Jak bys vysvětlil/a, co dělá neuronová síť, když ji učíme poznávat kočky na obrázcích?
9. Co myslíš, může se neuronová síť „splést“? A proč?
10. A jak bys neuronovou síť naučil/a, aby se zlepšovala?

asistent_funkce_zpetna_vazba {Zrekapituluj společně, co všechno už ví, a pochval ho/ji za přemýšlení. Nabídni možnost pokračovat další den, nebo se vrátit k části, která byla těžší.}

zak_funkce_pokracovani_nebo_konec {Žák/žákyně se rozhodne, zda chce pokračovat nebo končit.}

asistent_funkce_navazani_na_realny_svet {Pokud žák chce pokračovat, nabídni mu/ji krátkou reálnou ukázku využití neuronových sítí (např. překladače, samořiditelná auta, doporučování videí), a polož zvídavou otázku: „Jak myslíš, že tomu stroj rozumí?“ nebo „Co všechno by musel počítač vědět, aby to dokázal?“}`
}

async function init() {
  try {
    const instructionInput = document.getElementById("instructionInput");
    const prompt = await getPrompt();
    instructionInput.value = prompt;

    const tokenResponse = await fetch("http://localhost:3000/session");
    if (!tokenResponse.ok) {
      throw new Error(`Failed to get token: ${tokenResponse.status}`);
    }
    const tokenData = await tokenResponse.json();
    window.EPHEMERAL_KEY = tokenData.client_secret.value;

    startBtn.disabled = false;
  } catch (error) {
    updateStatus(`Initialization error: ${error.message}`);
    console.error("Initialization error:", error);
  }
}


function updateStatus(message) {
  const timestamp = new Date().toLocaleTimeString();
  statusDiv.innerHTML += `<div>[${timestamp}] ${message}</div>`;
  console.log(message);
}

startBtn.addEventListener("click", async () => {
  try {
    peerConnection = new RTCPeerConnection();

    peerConnection.onconnectionstatechange = () => {
      updateStatus(`Connection state: ${peerConnection.connectionState}`);
    };

    peerConnection.oniceconnectionstatechange = () => {
      updateStatus(
        `ICE connection state: ${peerConnection.iceConnectionState}`
      );
    };

    const audioEl = document.createElement("audio");
    audioEl.autoplay = true;
    peerConnection.ontrack = (e) => {
      audioEl.srcObject = e.streams[0];
    };

    dataChannel = peerConnection.createDataChannel("oai-events");
    dataChannel.addEventListener("message", (e) => {
      const event = JSON.parse(e.data);
      console.log("Received event:", event);
      updateStatus(`Received: ${event.type}`);
    });

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    peerConnection.addTrack(stream.getTracks()[0], stream);

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    const baseUrl = "https://api.openai.com/v1/realtime";
    const model = "gpt-4o-realtime-preview-2024-12-17";

    const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${window.EPHEMERAL_KEY}`,
        "Content-Type": "application/sdp",
      },
    });

    if (!sdpResponse.ok) {
      throw new Error(`HTTP error! status: ${sdpResponse.status}`);
    }

    const answer = {
      type: "answer",
      sdp: await sdpResponse.text(),
    };
    await peerConnection.setRemoteDescription(answer);
    updateStatus("Connected to OpenAI Realtime API");

    await new Promise((resolve, reject) => {
      dataChannel.onopen = () => {
        updateStatus("Data channel is open.");
        resolve();
      };
      dataChannel.onerror = (e) => {
        reject(new Error("Data channel error: " + e.message));
      };
    });
    
    dataChannel.addEventListener("message", (e) => {
      const event = JSON.parse(e.data);
      console.log("Received event:", event);
      updateStatus(`Received: ${event.type}`);
    });

    // Now send session instructions
    const voice = document.getElementById("voiceSelect").value;
    const instructions = document.getElementById("instructionInput").value;
    console.log("Instructions:", instructions);

    const sessionUpdate = {
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        instructions: instructions,
        voice: voice,
        temperature: 0.8,
        tool_choice: "auto",
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        input_audio_transcription: {
          model: "whisper-1"
        }
      }
    };
    dataChannel.send(JSON.stringify(sessionUpdate));
    updateStatus("Session configuration sent.");

    const responseCreate = {
      type: "response.create",
      response: {
        modalities: ["text", "audio"],
      },
    };
    dataChannel.send(JSON.stringify(responseCreate));
    updateStatus("Started conversation");

    startBtn.disabled = true;
    stopBtn.disabled = false;
  } catch (error) {
    updateStatus(`Error starting conversation: ${error.message}`);
  }
});


stopBtn.addEventListener("click", () => {
  try {
    if (dataChannel && dataChannel.readyState === "open") {
      // Gracefully stop the model's output
      dataChannel.send(JSON.stringify({ type: "response.cancel" }));
      updateStatus("Conversation canceled.");
    }

    // Reset UI (but keep connection alive)
    startBtn.disabled = false;
    stopBtn.disabled = true;

    // Clear status log
    statusDiv.innerHTML = `<div>[${new Date().toLocaleTimeString()}] Conversation reset. Click "Start" to begin again.</div>`;
  } catch (error) {
    updateStatus(`Error during reset: ${error.message}`);
    console.error("Reset error:", error);
  }
});

init();
