export interface Env {
	VECTORIZE: Vectorize;
	AI: Ai;
}
interface EmbeddingResponse {
	shape: number[];
	data: number[][];
}

async function handleSearch(env: Env, key: string | null) {
	// Your query: expect this to match vector ID. 1 in this example
	let userQuery = "orange cloud";
	const queryVector: EmbeddingResponse = await env.AI.run(
		"@cf/baai/bge-base-en-v1.5",
		{
			text: [key ?? ''],
		},
	);

	let matches = await env.VECTORIZE.query(queryVector.data[0], {
		topK: 3,
		returnMetadata: true,
	});
	return Response.json({
		// Expect a vector ID. 1 to be your top match with a score of
		// ~0.89693683
		// This tutorial uses a cosine distance metric, where the closer to one,
		// the more similar.
		matches: matches,
	});
}

async function handleInsert(env: Env, formData: FormData) {
	// In a real-world application, you could read content from R2 or
	// a SQL database (like D1) and pass it to Workers AI
	const textHtmlFile = formData.get("html");
	const title = formData.get("title") as string;
	if (!textHtmlFile) return Response.json("No file uploaded", { status: 400 });
	let textHtml = textHtmlFile;
	if (typeof textHtmlFile !== 'string') {
		textHtml = await textHtmlFile.text();
	}
	const modelResp: EmbeddingResponse = await env.AI.run(
		"@cf/baai/bge-base-en-v1.5",
		{
			text: textHtml as string,
		},
	);

	// Convert the vector embeddings into a format Vectorize can accept.
	// Each vector needs an ID, a value (the vector) and optional metadata.
	// In a real application, your ID would be bound to the ID of the source
	// document.
	let vectors: VectorizeVector[] = [];
	let id = title;
	modelResp.data.forEach((vector) => {
		vectors.push({ id: `${id}`, values: vector, metadata: { title } });
	});

	let inserted = await env.VECTORIZE.upsert(vectors);
	return Response.json(inserted);
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		let path = new URL(request.url).pathname;
		if (path.startsWith("/favicon")) {
			return new Response("", { status: 404 });
		}

		// You only need to generate vector embeddings once (or as
		// data changes), not on every request
		if (path === "/insert") {
			const formData = await request.formData();
			return handleInsert(env, formData);
		}

		const query = new URL(request.url).searchParams;
		const key = query.get("key");
		return handleSearch(env, key);
	},
} satisfies ExportedHandler<Env>;
