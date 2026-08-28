import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listTasks } from "@/lib/db";
import { analyzeTasks } from "@/lib/gemini";
import { describeDbError, describeGeminiError } from "@/lib/diagnostics";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let tasks;
  try {
    tasks = await listTasks(session.user.email, "open");
  } catch (err) {
    console.error("Analyze: list tasks error:", err);
    return NextResponse.json({ error: describeDbError(err) }, { status: 500 });
  }

  if (tasks.length === 0) {
    return NextResponse.json({
      summary: "Không có việc nào đang mở, anh đang trống lịch.",
      recommendations: [],
      risks: []
    });
  }

  const compact = tasks.map((t) => ({
    title: t.title,
    category: t.category,
    deadline: t.deadline,
    urgent: t.user_urgent,
    important: t.user_important
  }));

  try {
    const analysis = await analyzeTasks(compact);
    return NextResponse.json(analysis);
  } catch (err) {
    console.error("Gemini analyze error:", err);
    return NextResponse.json({ error: describeGeminiError(err) }, { status: 500 });
  }
}
