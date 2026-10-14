"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDown, ArrowLeft, Hash, LoaderCircle, MessageCircle, Plus, Send, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { sendMessageSchema } from "@/lib/validation";
import {
  createDirectChannelAction,
  createTaskChannelAction,
  getOlderMessagesAction,
  markChannelReadAction,
  sendMessageAction,
} from "@/server/actions/chat";
import type { z } from "zod";

export type ChatChannel = {
  id: string;
  type: "PROJECT" | "DIRECT" | "TASK";
  name: string;
  projectKey: string | null;
  projectId: string | null;
  taskId: string | null;
  members: { id: string; name: string; email: string; avatarUrl: string | null }[];
  unreadCount: number;
  latestMessage: { body: string; createdAt: string; senderId: string } | null;
};

export type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  sender: { id: string; name: string; avatarUrl: string | null };
  taskLinks: { token: string; taskId: string; projectId: string }[];
};

type Person = { id: string; name: string; email: string; avatarUrl: string | null };

export function ChatWorkspace({
  workspace,
  currentUser,
  channels,
  contacts,
  taskOptions,
  initialChannelId,
  initialMessages,
  hasMore: initialHasMore,
  canSendMessages,
}: {
  workspace: { id: string; name: string };
  currentUser: { id: string; name: string };
  channels: ChatChannel[];
  contacts: Person[];
  taskOptions: {
    id: string;
    number: number;
    title: string;
    project: { id: string; key: string; name: string };
  }[];
  initialChannelId: string | null;
  initialMessages: ChatMessage[];
  hasMore: boolean;
  canSendMessages: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(initialChannelId);
  const [messages, setMessages] = useState(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "offline">("connecting");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [newType, setNewType] = useState<"DM" | "TASK" | null>(null);
  const [selectedPerson, setSelectedPerson] = useState("");
  const [selectedTask, setSelectedTask] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const channel = channels.find(({ id }) => id === selectedId) ?? null;
  const activeChannelId = channel?.id;
  const form = useForm<z.infer<typeof sendMessageSchema>>({
    resolver: zodResolver(sendMessageSchema),
    defaultValues: { channelId: selectedId ?? "", body: "" },
  });
  const messageBody = useWatch({ control: form.control, name: "body" });

  useEffect(() => {
    if (!activeChannelId) return;
    let active = true;
    void markChannelReadAction({ channelId: activeChannelId }).then((result) => {
      if (active && result.error) setError(result.error);
      router.refresh();
    });
    const supabase = createClient();
    const realtime = supabase
      .channel(`chat:${activeChannelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "Message", filter: `channelId=eq.${activeChannelId}` },
        () => {
          void getOlderMessagesAction({ channelId: activeChannelId }).then((result) => {
            if (!active) return;
            if (result.error) setError(result.error);
            else if (result.messages) {
              setMessages(result.messages);
              setHasMore(result.hasMore ?? false);
              void markChannelReadAction({ channelId: activeChannelId });
              router.refresh();
            }
          });
        },
      )
      .subscribe((status) => {
        if (!active) return;
        setConnectionState(status === "SUBSCRIBED" ? "connected" : status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "offline" : "connecting");
      });
    return () => {
      active = false;
      void supabase.removeChannel(realtime);
    };
  }, [activeChannelId, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [selectedId]);

  function selectChannel(channelId: string) {
    setError("");
    setSelectedId(channelId);
    router.replace(`/chat?channel=${encodeURIComponent(channelId)}`, { scroll: false });
  }

  function send(values: z.infer<typeof sendMessageSchema>) {
    setError("");
    startTransition(async () => {
      const result = await sendMessageAction(values);
      if (result.error) {
        setError(result.error);
        return;
      }
      form.reset({ channelId: values.channelId, body: "" });
      if (result.message) {
        setMessages((current) =>
          current.some(({ id }) => id === result.message?.id)
            ? current
            : [...current, result.message!].slice(-50),
        );
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    });
  }

  function submitCurrentMessage() {
    void form.handleSubmit(send)();
  }

  function loadOlder() {
    const oldest = messages[0];
    if (!channel || !oldest) return;
    startTransition(async () => {
      const result = await getOlderMessagesAction({ channelId: channel.id, before: oldest.createdAt });
      if (result.error) setError(result.error);
      else if (result.messages) {
        setMessages((current) => [...result.messages!, ...current]);
        setHasMore(result.hasMore ?? false);
      }
    });
  }

  function createConversation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      const result = newType === "DM"
        ? await createDirectChannelAction({ workspaceId: workspace.id, userId: selectedPerson })
        : await createTaskChannelAction({ taskId: selectedTask });
      if (result.error) setError(result.error);
      else if (result.channelId) {
        setNewType(null);
        setSelectedPerson("");
        setSelectedTask("");
        router.push(`/chat?channel=${encodeURIComponent(result.channelId)}`);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex h-[calc(100dvh-180px)] min-h-[540px] overflow-hidden rounded-xl border border-border bg-card">
      <aside className={`${channel ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-r border-border md:w-[300px]`}>
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <div>
            <h1 className="font-semibold">Team chat</h1>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{workspace.name}</p>
          </div>
          {canSendMessages && (
            <Button aria-label="New conversation" onClick={() => setNewType((value) => value ? null : "DM")} type="button" variant="outline" size="icon">
              <Plus aria-hidden="true" />
            </Button>
          )}
        </div>
        {newType && canSendMessages && (
          <form className="space-y-2 border-b border-border p-3" onSubmit={createConversation}>
            <label className="form-label" htmlFor="new-conversation">{newType === "DM" ? "Start a direct message" : "Start a task discussion"}</label>
            {newType === "DM" ? (
              <select className="form-control" id="new-conversation" onChange={(event) => setSelectedPerson(event.target.value)} required value={selectedPerson}>
                <option value="">Choose a teammate…</option>
                {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name} · {contact.email}</option>)}
              </select>
            ) : (
              <select className="form-control" id="new-conversation" onChange={(event) => setSelectedTask(event.target.value)} required value={selectedTask}>
                <option value="">Choose a task…</option>
                {taskOptions.map((task) => <option key={task.id} value={task.id}>{task.project.key}-{task.number} · {task.title}</option>)}
              </select>
            )}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setNewType(null)} type="button" variant="ghost" size="sm">Cancel</Button>
              <Button disabled={pending || (newType === "DM" ? !selectedPerson : !selectedTask)} type="submit" size="sm">Open</Button>
            </div>
          </form>
        )}
        <nav aria-label="Conversations" className="flex-1 overflow-y-auto">
          {channels.map((item) => (
            <button
              aria-current={item.id === selectedId ? "page" : undefined}
              className={`flex w-full items-start gap-3 border-b border-border/70 px-4 py-3 text-left transition hover:bg-muted/60 ${item.id === selectedId ? "bg-accent" : ""}`}
              key={item.id}
              onClick={() => selectChannel(item.id)}
              type="button"
            >
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                {item.type === "PROJECT" ? <Hash aria-hidden="true" className="size-4" /> : item.type === "TASK" ? <MessageCircle aria-hidden="true" className="size-4" /> : <Users aria-hidden="true" className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{item.name}</span>
                  {item.unreadCount > 0 && <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{item.unreadCount > 9 ? "9+" : item.unreadCount}</span>}
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {item.latestMessage?.body ?? (item.type === "PROJECT" ? "Project channel" : "No messages yet")}
                </span>
              </span>
            </button>
          ))}
          {!channels.length && !newType && (
            <div className="px-5 py-10 text-center">
              <MessageCircle aria-hidden="true" className="mx-auto size-7 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">No conversations yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Start a direct message or task discussion.</p>
            </div>
          )}
        </nav>
      </aside>

      <main className={`${channel ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
        {channel ? (
          <>
            <header className="flex items-center gap-3 border-b border-border px-4 py-3.5">
              <Button aria-label="Back to conversations" className="md:hidden" onClick={() => setSelectedId(null)} type="button" variant="ghost" size="icon">
                <ArrowLeft aria-hidden="true" />
              </Button>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                {channel.type === "PROJECT" ? <Hash aria-hidden="true" className="size-4" /> : <Users aria-hidden="true" className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold">{channel.name}</h2>
                <p className="text-xs text-muted-foreground">
                  {channel.type === "PROJECT" ? "Project channel" : channel.type === "TASK" ? "Task discussion" : channel.members.map(({ name }) => name).join(", ")}
                </p>
              </div>
              <span className={`size-2 rounded-full ${connectionState === "connected" ? "bg-emerald-500" : connectionState === "offline" ? "bg-amber-500" : "animate-pulse bg-muted-foreground"}`} title={`Realtime ${connectionState}`} />
            </header>
            <section aria-label={`${channel.name} messages`} aria-live="polite" className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
              {hasMore && (
                <div className="text-center">
                  <Button disabled={pending} onClick={loadOlder} type="button" variant="ghost" size="sm">
                    <ArrowDown aria-hidden="true" className="rotate-180" />
                    Load older messages
                  </Button>
                </div>
              )}
              {messages.length === 0 ? (
                <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
                  <MessageCircle aria-hidden="true" className="size-8 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium">Start the conversation</p>
                  <p className="mt-1 text-xs text-muted-foreground">Messages are visible to members of this conversation.</p>
                </div>
              ) : messages.map((message) => (
                <MessageBubble
                  currentUserId={currentUser.id}
                  key={message.id}
                  message={message}
                  projectKey={channel.projectKey}
                />
              ))}
              <div ref={bottomRef} />
            </section>
            {canSendMessages ? <footer className="border-t border-border p-3 sm:p-4">
              {error && <p className="mb-2 text-sm text-destructive" role="alert">{error}</p>}
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">Use @email to mention a teammate. Task keys such as ATL-123 become links.</p>
                <Button aria-expanded={mentionOpen} onClick={() => setMentionOpen((value) => !value)} type="button" variant="ghost" size="sm">@ Mention</Button>
              </div>
              {mentionOpen && (
                <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Mention a conversation member">
                  {channel.members.map((member) => (
                    <button
                      className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      key={member.id}
                      onClick={() => {
                        const body = form.getValues("body");
                        form.setValue("body", `${body}${body && !body.endsWith(" ") ? " " : ""}@${member.email} `, { shouldDirty: true });
                        setMentionOpen(false);
                      }}
                      type="button"
                    >
                      @{member.name}
                    </button>
                  ))}
                  {!channel.members.length && <span className="text-xs text-muted-foreground">No other conversation members.</span>}
                </div>
              )}
              <form
                className="flex items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitCurrentMessage();
                }}
              >
                <input type="hidden" {...form.register("channelId")} value={channel.id} />
                <label className="sr-only" htmlFor="chat-message">Write a message</label>
                <textarea
                  className="form-control min-h-11 max-h-36 flex-1 resize-y"
                  id="chat-message"
                  maxLength={5000}
                  placeholder={`Message ${channel.type === "PROJECT" ? `# ${channel.name}` : channel.name}`}
                  {...form.register("body")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submitCurrentMessage();
                    }
                  }}
                />
                <Button aria-label="Send message" disabled={pending || !messageBody?.trim()} type="submit" size="icon-lg">
                  {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Send aria-hidden="true" />}
                </Button>
              </form>
            </footer> : (
              <p className="border-t border-border px-4 py-3 text-center text-xs text-muted-foreground">You have read-only access to conversations.</p>
            )}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <MessageCircle aria-hidden="true" className="size-10 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">Conversations for your team</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Choose a channel, or start a direct message or task discussion.</p>
            {canSendMessages && <Button className="mt-4" onClick={() => setNewType("DM")} type="button"><Plus aria-hidden="true" /> New message</Button>}
          </div>
        )}
      </main>
    </div>
  );
}

function MessageBubble({
  message,
  currentUserId,
  projectKey,
}: {
  message: ChatMessage;
  currentUserId: string;
  projectKey: string | null;
}) {
  const mine = message.sender.id === currentUserId;
  const taskLinks = new Map(message.taskLinks.map((link) => [link.token, link]));
  const tokens = message.body.split(/(@[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b[A-Z][A-Z0-9]{1,9}-\d+\b)/gi);
  return (
    <article className={`flex gap-2.5 ${mine ? "flex-row-reverse" : ""}`}>
      <span aria-hidden="true" className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
        {message.sender.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
      </span>
      <div className={`max-w-[min(82%,680px)] ${mine ? "text-right" : ""}`}>
        <div className={`mb-1 flex items-baseline gap-2 text-[11px] ${mine ? "flex-row-reverse" : ""}`}>
          <span className="font-medium">{mine ? "You" : message.sender.name}</span>
          <time className="text-muted-foreground" dateTime={message.createdAt}>
            {new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(message.createdAt))}
          </time>
        </div>
        <div className={`inline-block whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-left text-sm leading-5 ${mine ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-muted"}`}>
          {tokens.map((token, index) => {
            if (token.startsWith("@")) return <span className="font-semibold underline decoration-dotted" key={`${index}-${token}`}>{token}</span>;
            const link = taskLinks.get(token);
            if (link) return <Link className="font-semibold underline underline-offset-2" href={`/projects/${link.projectId}/board?taskId=${encodeURIComponent(link.taskId)}`} key={`${index}-${token}`}>{token}</Link>;
            return <span key={`${index}-${token}`}>{token}</span>;
          })}
        </div>
        {projectKey && <span className="sr-only">{projectKey}</span>}
      </div>
    </article>
  );
}
