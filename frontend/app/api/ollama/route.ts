import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    const response = await fetch("http://host.docker.internal:11434/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen2.5-coder:latest",
        prompt: prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    return NextResponse.json({ response: data.response });
  } catch (error: any) {
    console.error("Error calling Ollama:", error);
    return NextResponse.json(
      { error: "Failed to fetch response from Ollama" },
      { status: 500 }
    );
  }
}
