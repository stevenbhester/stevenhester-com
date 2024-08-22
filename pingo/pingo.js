document.getElementById('question-form').addEventListener('submit', function(event) {
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

    // Simulate a bot response (you would replace this with an actual API call)
    setTimeout(function() {
        const botResponse = document.createElement('div');
        botResponse.classList.add('message', 'bot-message');
        botResponse.textContent = getBotResponse(userInput);
        conversation.appendChild(botResponse);

        // Scroll to the bottom of the chat box
        conversation.scrollTop = conversation.scrollHeight;
    }, 500);
});

// placeholder for gpt api hookup (through heroku?)
function getBotResponse(question) {
  try {
    const response = await fetch("https://music-grid-io-42616e204fd3.herokuapp.com/fetch-ai-weddingresponse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: question })
    });
    const data = await response.json();
    console.dir(data);
    let response = data.message.content.trim();
    console.log(response);
    return response;
  } catch (error) {
    console.error("Error generating response: ", error.message);
    return "AI Error, Not Talking To You Now";
  }
}
