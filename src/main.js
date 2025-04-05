import "./style.css";

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusDiv = document.getElementById("status");

let peerConnection = null;
let dataChannel = null;

async function init() {
  try {
    // 从服务器获取 ephemeral key
    const tokenResponse = await fetch("http://localhost:3000/session");
    if (!tokenResponse.ok) {
      throw new Error(`Failed to get token: ${tokenResponse.status}`);
    }
    const tokenData = await tokenResponse.json();
    const EPHEMERAL_KEY = tokenData.client_secret.value;

    // 创建 WebRTC 连接
    peerConnection = new RTCPeerConnection();

    // 添加连接状态监听
    peerConnection.onconnectionstatechange = () => {
      updateStatus(`Connection state: ${peerConnection.connectionState}`);
    };

    peerConnection.oniceconnectionstatechange = () => {
      updateStatus(
        `ICE connection state: ${peerConnection.iceConnectionState}`
      );
    };

    // 设置音频元素播放模型返回的音频
    const audioEl = document.createElement("audio");
    audioEl.autoplay = true;
    peerConnection.ontrack = (e) => {
      audioEl.srcObject = e.streams[0];
    };

    // 设置数据通道
    dataChannel = peerConnection.createDataChannel("oai-events");
    dataChannel.addEventListener("message", (e) => {
      const event = JSON.parse(e.data);
      console.log("Received event:", event);
      updateStatus(`Received: ${event.type}`);
    });

    // 获取麦克风权限并添加音轨
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    peerConnection.addTrack(stream.getTracks()[0], stream);

    // 创建并设置本地描述
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // 连接到 OpenAI Realtime API
    const baseUrl = "https://api.openai.com/v1/realtime";
    const model = "gpt-4o-realtime-preview-2024-12-17";

    try {
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
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
      startBtn.disabled = false;
    } catch (error) {
      updateStatus(`Connection error: ${error.message}`);
      console.error("Connection error:", error);
    }
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
    if (dataChannel && dataChannel.readyState === "open") {
      const voice = document.getElementById("voiceSelect").value;
      const instructions = document.getElementById("instructionInput").value;

      const sessionUpdate = {
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          instructions: instructions,
          voice: voice,  // You can dynamically set this based on user selection
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
    }
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

// 初始化应用
init();
