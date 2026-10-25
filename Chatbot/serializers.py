from rest_framework import serializers
from .models import Session, Chat
from django.contrib.auth.models import User
from django.contrib.auth import authenticate, login
import re
from google import genai
from google.genai import types
from dotenv import load_dotenv
import os

load_dotenv()


class SignUpSerializer(serializers.ModelSerializer):
    confirm_password = serializers.CharField(
        write_only=True, required=False, style={"input_type": "password"}
    )

    class Meta:
        model = User
        fields = [
            "id",
            "first_name",
            "last_name",
            "username",
            "email",
            "password",
            "confirm_password",
        ]
        extra_kwargs = {
            "username": {"required": True, "allow_blank": False},
            "email": {"required": True, "allow_blank": False},
            "password": {"write_only": True, "required": True},
        }

    def validate_password(self, password):
        if len(password) < 8:
            raise serializers.ValidationError("Password must be at least 8 characters!")
        if not re.search(r"[A-Z]", password):
            raise serializers.ValidationError(
                "Password must contain at least one uppercase letter!"
            )
        if not re.search(r"[a-z]", password):
            raise serializers.ValidationError(
                "Password must contain at least one lowercase letter!"
            )
        if not re.search(r"[0-9]", password):
            raise serializers.ValidationError(
                "Password must contain at least one number!"
            )
        if not re.search(r"[!@#$%^&*()_+\-=\[\]{};'\":\\|,.<>/?]", password):
            raise serializers.ValidationError(
                "Password must contain at least one special character!"
            )
        return password

    def validate(self, data):
        password = data.get("password")
        confirm_password = data.get("confirm_password")
        if password and not confirm_password:
            raise serializers.ValidationError(
                {"confirm_password": "Confirm password is required."}
            )
        if password != confirm_password:
            raise serializers.ValidationError(
                {"confirm_password": "Confirm_Passwords do not match with Password!"}
            )
        return data

    def create(self, validated_data):
        validated_data.pop("confirm_password")
        user = User.objects.create_user(
            first_name=validated_data["first_name"],
            last_name=validated_data["last_name"],
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
        )
        return user


class SignInSerializer(serializers.Serializer):
    username_or_email = serializers.CharField(required=True, allow_blank=False)
    password = serializers.CharField(required=True, style={"input_type": "password"})
    user = None

    def validate(self, data):
        request = self.context.get("request")
        username_or_email = data.get("username_or_email")
        password = data.get("password")

        if not username_or_email:
            raise serializers.ValidationError(
                {"username_or_email": "Username or Email is required."}
            )
        if not password:
            raise serializers.ValidationError({"password": "Password is required."})

        user = None

        if "@" in username_or_email:
            users = User.objects.filter(email=username_or_email)
            if not users.exists():
                raise serializers.ValidationError({"email": "Invalid Email!"})
            user_obj = users.first() 
            user = authenticate(request, username=user_obj.username, password=password)
        else: 
            users = User.objects.filter(username=username_or_email)
            if not users.exists():
                raise serializers.ValidationError({"username": "Invalid Username!"})
            user_obj = users.first()
            user = authenticate(request, username=user_obj.username, password=password)

        if user is None:
            raise serializers.ValidationError({"password": "Invalid Password!"})

        data["user"] = user
        return data


class SessionSerializer(serializers.ModelSerializer):
    username = serializers.SlugRelatedField(
        slug_field="username", queryset=User.objects.all()
    )
    read_only_fields = ['session_id', 'created_at', 'username']

    class Meta:
        model = Session
        fields = ["id", "session_id", "title", "description", "created_at", "username"]
        read_only_fields = ['session_id', 'created_at', 'username']
        
class UserSessionsSerializer(serializers.ModelSerializer):
    username = serializers.SlugRelatedField(slug_field="username", read_only=True)

    class Meta:
        model = Session
        fields = ["id", "session_id", "title", "description", "created_at", "username"]


def get_client():
    load_dotenv(override=True)
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None
    try:
        return genai.Client(api_key=api_key)
    except Exception:
        return None

SYSTEM_PROMPT = """
You are a professional and empathetic customer support assistant.
Role:

Assist users with accounts, software, technical issues, and general support inquiries.
Provide clear, concise, and solution-focused guidance.

Communication Guidelines:

Respond in friendly, professional English using short, clear paragraphs.
Use clean formatting without excessive bold text or symbols like *#.
Avoid starting every message with an acknowledgment or apology unless contextually necessary.
Focus on giving actionable solutions directly.
Ask clarifying questions only when essential (maximum 3).

Response Style:

Provide actionable, step-by-step guidance in a natural, readable flow.
Keep responses concise but informative.
Use formatting (such as bullet points or numbering) only where it improves clarity.

Accuracy and Safety:

Do not speculate or provide unverified information.
Recommend checking logs, credentials, configurations, or permissions when relevant.

Conversation Awareness:

Maintain context using previous messages.
Avoid repeating explanations unless clarification is requested.
Ensure continuity and consistency across the conversation.

Goal:

Resolve the user’s issue efficiently while keeping the reply direct, helpful, and friendly.
"""


class ChatSerializer(serializers.ModelSerializer):
    class Meta:
        model = Chat
        fields = ["id", "session", "message", "response", "timestamp"]
        read_only_fields = ['session', 'response', 'timestamp']  
        extra_kwargs = {
            'message': {'required': True, 'allow_blank': False}
        }

    def validate_message(self, value):
        message = value.strip()
        if not message:
            raise serializers.ValidationError("Message cannot be empty!")
        return message

    def create(self, validated_data):
        session = validated_data["session"]
        message = validated_data["message"].strip()

        is_first_message = not Chat.objects.filter(session=session).exists()

        previous_chats = Chat.objects.filter(session=session).order_by("timestamp")
        conversation = SYSTEM_PROMPT.strip() + "\n\n"
        for chat in previous_chats:
            conversation += f"User: {chat.message}\n"
            if chat.response:
                conversation += f"Assistant: {chat.response}\n"
        conversation += f"User: {message}\nAssistant:"

        reply = "Sorry, I could not respond right now. Please try again later."

        client = get_client()
        if not client:
            reply = "Gemini API key is not configured. Please set GEMINI_API_KEY in your .env file."
        else:
            try:
                model_name = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
                response = client.models.generate_content(
                    model=model_name,
                    config=types.GenerateContentConfig(
                        system_instruction=SYSTEM_PROMPT,
                        temperature=0.6,
                        max_output_tokens=1024,
                    ),
                    contents=conversation,
                )

                if response.candidates and len(response.candidates) > 0:
                    reply = "".join(
                        part.text
                        for part in response.candidates[0].content.parts
                        if hasattr(part, "text")
                    ).strip()
                    if not reply:
                        reply = "I received your message, but couldn't generate a proper response."
                else:
                    if hasattr(response, "prompt_feedback") and response.prompt_feedback:
                        block_reason = getattr(
                            response.prompt_feedback, "block_reason", "UNKNOWN"
                        )
                        reply = f"Sorry, I can't assist with this due to content guidelines (Blocked: {block_reason})."
                    else:
                        reply = "No response generated. Please try rephrasing."

            except Exception as e:
                error_msg = str(e).lower()
                # print("GEMINI API ERROR:", repr(e))

                if (
                    "quota" in error_msg
                    or "resource_exhausted" in error_msg
                    or "429" in error_msg
                ):
                    reply = "The AI service is temporarily busy due to high demand. Please try again in a few minutes."
                elif "billing" in error_msg:
                    reply = "AI service requires billing to be enabled. Please contact the administrator."
                elif "model" in error_msg and "not found" in error_msg:
                    reply = "AI model error. Please check configuration."
                elif "safety" in error_msg or "blocked" in error_msg:
                    reply = "Sorry, I can't respond due to content safety guidelines."
                else:
                    reply = "Network error. Please check your connection and try again."

        validated_data["response"] = reply
        chat = Chat.objects.create(**validated_data)

        if is_first_message and session.title == "New Chat":
            title = self.generate_title(message)
            session.title = title
            session.save()
            # print(f"New session title generated: {title}")

        return chat

    def generate_title(self, first_message: str) -> str:
        """
        Generates a concise title (3-7 words) for a customer support chat based on the user's first message.
        Falls back gracefully if the AI model fails.
        """
        if not first_message or not first_message.strip():
            return "Support Chat"

        prompt = f"""You are a concise title generator for customer support chats.
    Your task is to create a short title of 3-7 words that best summarizes the main issue or topic in the user's first message.
    Focus only on the core problem or request.
    Do not use quotes, explanations, or any additional text.
    Output ONLY the title.

    User's first message: "{first_message.strip()}"

    Title:"""

        client = get_client()
        if not client:
            words = first_message.strip().split()
            return " ".join(words[:5]) if words else "Support Chat"

        try:
            model_name = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
            response = client.models.generate_content(
                model=model_name,
                config=types.GenerateContentConfig(
                    temperature=0.3,
                    max_output_tokens=20,
                    top_p=0.8,
                ),
                contents=prompt,
            )

            if response.candidates:
                candidate = response.candidates[0]
                if (
                    getattr(candidate, "finish_reason", None)
                    == candidate.FinishReason.SAFETY
                ):
                    return "Support Chat"

                title = "".join(
                    part.text
                    for part in candidate.content.parts
                    if hasattr(part, "text")
                ).strip()

                if title:
                    title = title.strip(" \"'")
                    words = title.split()

                    if 3 <= len(words) <= 10:
                        return title

                    if len(words) > 10:
                        return " ".join(words[:7]) + "..."

            keywords = [
                "withdraw",
                "withdrawal",
                "deposit",
                "transfer",
                "money",
                "balance",
                "login",
                "password",
                "error",
                "503",
                "app",
                "crash",
                "not working",
                "sbi",
                "bank",
                "account",
                "transaction",
                "payment",
                "card",
                "upi",
            ]
            found = [word for word in keywords if word in first_message.lower()]
            if found:
                title = " ".join(found[:5]).title()
                if 3 <= len(title.split()) <= 10:
                    return title

            words = [
                w for w in first_message.split()[:15] if len(w) > 2 and w.isalnum()
            ]
            if len(words) >= 3:
                return " ".join(words[:7]).strip(".,!?") + (
                    "..." if len(words) > 7 else ""
                )

            return "Support Chat"

        except Exception as e:
            try:
                words = [
                    w for w in first_message.split()[:15] if len(w) > 2 and w.isalnum()
                ]
                if len(words) >= 3:
                    return " ".join(words[:7]).strip(".,!?") + (
                        "..." if len(words) > 7 else ""
                    )
            except:
                pass
            return "Support Chat"
