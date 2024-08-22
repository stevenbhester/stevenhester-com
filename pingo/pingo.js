document.getElementById('question-form').addEventListener('submit', async function(event) {
    event.preventDefault();

    // Get the user's question
    const userInput = document.getElementById('question-input').value;
    if (userInput.trim() === "") return;

    // Clear the input field
    document.getElementById('question-input').value = "";

    // Add the user's question to the conversation
    const conversation = document.getElementById('conversation');
    const userMessage = document.createElement('div');
    userMessage.classList.add('message', 'user-message');
    userMessage.textContent = userInput;
    conversation.appendChild(userMessage);

    // Fetch the bot's response
    const botResponseText = await getBotResponse(userInput);
    const botResponse = document.createElement('div');
    botResponse.classList.add('message', 'bot-message');
    botResponse.textContent = botResponseText;
    conversation.appendChild(botResponse);

    // Scroll to the bottom of the chat box
    conversation.scrollTop = conversation.scrollHeight;
});

let threadExists = false;
let threadId = null;

async function getBotResponse(question) {
    try {
        const response = await fetch("https://music-grid-io-42616e204fd3.herokuapp.com/fetch-ai-weddingresponse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question, threadExists, threadId })
        });
        const data = await response.json();
        console.dir(data);
        threadId = data.threadId;
        threadExists = !!threadId;
        return data.msg.trim();
    } catch (error) {
        console.error("AI got pissed: ", error.message);
        return "AI refuses to speak with the unworthy, go reflect on your crimes. ";
    }
}






