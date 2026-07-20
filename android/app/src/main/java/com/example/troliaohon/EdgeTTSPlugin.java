package com.example.troliaohon;

import android.media.MediaPlayer;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import okio.ByteString;

@CapacitorPlugin(name = "EdgeTTS")
public class EdgeTTSPlugin extends Plugin {

    private static final String TAG = "EdgeTTS";
    private static final String WS_URL =
        "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4";

    private MediaPlayer mediaPlayer;
    private WebSocket activeWebSocket;

    private String generateSecMsGec() {
        long unixTime = System.currentTimeMillis() / 1000L;
        long winEpoch = 11644473600L;
        long ticks = unixTime + winEpoch;
        ticks -= ticks % 300;
        ticks *= 10000000L;

        String strToHash = ticks + "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
        try {
            java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(strToHash.getBytes("US-ASCII"));
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString().toUpperCase();
        } catch (Exception e) {
            return "";
        }
    }

    @PluginMethod()
    public void speak(PluginCall call) {
        String inputText = call.getString("text", "");
        String voice = call.getString("voice", "vi-VN-HoaiMyNeural");

        if (inputText.isEmpty()) {
            call.reject("Text is empty");
            return;
        }

        stopInternal();

        OkHttpClient client = new OkHttpClient.Builder()
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .writeTimeout(10, TimeUnit.SECONDS)
                .build();

        String CHROMIUM_FULL_VERSION = "130.0.2849.68";
        String CHROMIUM_MAJOR_VERSION = "130";
        String finalUrl = WS_URL + "&Sec-MS-GEC=" + generateSecMsGec() + "&Sec-MS-GEC-Version=1-" + CHROMIUM_FULL_VERSION;

        byte[] muidBytes = new byte[16];
        new java.security.SecureRandom().nextBytes(muidBytes);
        StringBuilder muidHex = new StringBuilder();
        for (byte b : muidBytes) {
            String hex = Integer.toHexString(0xff & b);
            if (hex.length() == 1) muidHex.append('0');
            muidHex.append(hex);
        }
        String muid = muidHex.toString().toUpperCase();

        Request request = new Request.Builder()
                .url(finalUrl)
                .addHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" + CHROMIUM_MAJOR_VERSION + ".0.0.0 Safari/537.36 Edg/" + CHROMIUM_MAJOR_VERSION + ".0.0.0")
                .addHeader("Origin", "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold")
                .addHeader("Pragma", "no-cache")
                .addHeader("Cache-Control", "no-cache")
                .addHeader("Cookie", "muid=" + muid + ";")
                .build();

        ByteArrayOutputStream audioBuffer = new ByteArrayOutputStream();
        AtomicBoolean handled = new AtomicBoolean(false);
        AtomicInteger binaryCount = new AtomicInteger(0);

        String reqId = UUID.randomUUID().toString().replace("-", "");

        activeWebSocket = client.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onOpen(WebSocket webSocket, Response response) {
                Log.d(TAG, "WebSocket connected OK");

                // 1. Send speech.config
                String config = "X-Timestamp:" + getTimestamp()
                    + "\r\nContent-Type:application/json; charset=utf-8"
                    + "\r\nPath:speech.config"
                    + "\r\n\r\n{\"context\":{\"synthesis\":{\"audio\":{\"metadataoptions\":"
                    + "{\"sentenceBoundaryEnabled\":\"false\",\"wordBoundaryEnabled\":\"true\"},"
                    + "\"outputFormat\":\"audio-24khz-48kbitrate-mono-mp3\"}}}}";
                webSocket.send(config);
                Log.d(TAG, "Sent speech.config");

                // 2. Send SSML
                String escaped = inputText
                    .replace("&", "&amp;")
                    .replace("<", "&lt;")
                    .replace(">", "&gt;")
                    .replace("\"", "&quot;")
                    .replace("'", "&apos;");
                String ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis'"
                    + " xml:lang='vi-VN'><voice name='" + voice + "'>"
                    + "<prosody pitch='+0Hz' rate='+0%' volume='+0%'>"
                    + escaped + "</prosody></voice></speak>";
                String msg = "X-RequestId:" + reqId
                    + "\r\nContent-Type:application/ssml+xml"
                    + "\r\nX-Timestamp:" + getTimestamp()
                    + "\r\nPath:ssml"
                    + "\r\n\r\n" + ssml;
                webSocket.send(msg);
                Log.d(TAG, "Sent SSML for voice=" + voice + " text=" + inputText.substring(0, Math.min(50, inputText.length())));
            }

            @Override
            public void onMessage(WebSocket webSocket, String message) {
                Log.d(TAG, "WS Text (" + message.length() + " chars): " + message.substring(0, Math.min(200, message.length())));

                if (message.contains("Path:turn.end")) {
                    Log.d(TAG, "turn.end received. Total binary msgs=" + binaryCount.get() + " audioBytes=" + audioBuffer.size());
                    webSocket.close(1000, "done");
                    if (handled.compareAndSet(false, true)) {
                        playAudioBuffer(audioBuffer, call);
                    }
                }
            }

            @Override
            public void onMessage(WebSocket webSocket, ByteString bytes) {
                byte[] data = bytes.toByteArray();
                int count = binaryCount.incrementAndGet();

                if (data.length < 2) {
                    Log.w(TAG, "Binary msg #" + count + " too short: " + data.length + " bytes");
                    return;
                }

                // Edge TTS binary format: first 2 bytes = header length (big-endian)
                // Audio data starts at offset (2 + headerLength)
                int headerLength = ((data[0] & 0xFF) << 8) | (data[1] & 0xFF);
                int audioStart = 2 + headerLength;

                if (audioStart >= data.length) {
                    // This can happen for the final empty binary message
                    Log.d(TAG, "Binary msg #" + count + ": no audio payload (headerLen=" + headerLength + " total=" + data.length + ")");
                    return;
                }

                int audioBytes = data.length - audioStart;
                synchronized (audioBuffer) {
                    audioBuffer.write(data, audioStart, audioBytes);
                }
                Log.d(TAG, "Binary msg #" + count + ": +" + audioBytes + " bytes (total=" + audioBuffer.size() + ")");
            }

            @Override
            public void onFailure(WebSocket webSocket, Throwable t, Response response) {
                String errMsg = t != null ? t.getMessage() : "unknown";
                int respCode = -1;
                if (response != null) {
                    respCode = response.code();
                }
                Log.e(TAG, "WebSocket FAILURE: code=" + respCode + " err=" + errMsg, t);
                if (handled.compareAndSet(false, true)) {
                    call.reject("EdgeTTS connection failed (HTTP " + respCode + "): " + errMsg);
                }
            }

            @Override
            public void onClosed(WebSocket webSocket, int code, String reason) {
                Log.d(TAG, "WebSocket closed: code=" + code + " reason=" + reason + " audioBytes=" + audioBuffer.size());
                if (audioBuffer.size() > 0 && handled.compareAndSet(false, true)) {
                    playAudioBuffer(audioBuffer, call);
                }
            }
        });
    }

    private String getTimestamp() {
        java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat(
            "EEE MMM dd yyyy HH:mm:ss 'GMT+0000 (Coordinated Universal Time)'",
            java.util.Locale.US
        );
        sdf.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
        return sdf.format(new java.util.Date());
    }

    @PluginMethod()
    public void stop(PluginCall call) {
        stopInternal();
        call.resolve(new JSObject());
    }

    private void playAudioBuffer(ByteArrayOutputStream buffer, PluginCall call) {
        int bufferSize = buffer.size();
        Log.d(TAG, "playAudioBuffer called with " + bufferSize + " bytes");

        if (bufferSize == 0) {
            call.reject("No audio received from server (0 bytes)");
            return;
        }

        try {
            File tmp = File.createTempFile("edgetts_", ".mp3", getContext().getCacheDir());
            FileOutputStream fos = new FileOutputStream(tmp);
            buffer.writeTo(fos);
            fos.flush();
            fos.close();

            Log.d(TAG, "Audio saved to: " + tmp.getAbsolutePath() + " size=" + tmp.length());

            getActivity().runOnUiThread(() -> {
                try {
                    stopMediaPlayer();
                    mediaPlayer = new MediaPlayer();
                    mediaPlayer.setDataSource(tmp.getAbsolutePath());
                    mediaPlayer.prepare();
                    Log.d(TAG, "MediaPlayer prepared, duration=" + mediaPlayer.getDuration() + "ms");
                    mediaPlayer.setOnCompletionListener(mp -> {
                        mp.release();
                        mediaPlayer = null;
                        tmp.delete();
                        call.resolve(new JSObject());
                    });
                    mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                        Log.e(TAG, "MediaPlayer error: what=" + what + " extra=" + extra);
                        mp.release();
                        mediaPlayer = null;
                        tmp.delete();
                        call.reject("Playback error: what=" + what + " extra=" + extra);
                        return true;
                    });
                    mediaPlayer.start();
                    Log.d(TAG, "MediaPlayer started!");
                } catch (Exception e) {
                    Log.e(TAG, "Play error", e);
                    tmp.delete();
                    call.reject("Play error (" + bufferSize + "B): " + e.getClass().getSimpleName() + " - " + e.getMessage());
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "File error", e);
            call.reject("File error: " + e.getMessage());
        }
    }

    private void stopMediaPlayer() {
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) mediaPlayer.stop();
                mediaPlayer.release();
            } catch (Exception e) { /* ignore */ }
            mediaPlayer = null;
        }
    }

    private void stopInternal() {
        if (activeWebSocket != null) {
            try { activeWebSocket.cancel(); } catch (Exception e) { /* ignore */ }
            activeWebSocket = null;
        }
        stopMediaPlayer();
    }
}
