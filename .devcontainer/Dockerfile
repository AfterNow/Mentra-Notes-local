FROM nvidia/cuda:13.2.0-cudnn-runtime-ubuntu24.04
#FROM ubuntu:noble

# Install locales
RUN apt-get update && \
    apt-get install -y sudo locales

RUN locale-gen en_US.UTF-8  
ENV LANG en_US.UTF-8  
ENV LANGUAGE en_US:en  
ENV LC_ALL en_US.UTF-8  

# Check if a user with UID 1000 already exists, and get its username
RUN if [ -n "$(getent passwd 1000)" ]; then \
        USERNAME=$(getent passwd 1000 | cut -d: -f1); \
        echo "User with UID 1000 found: $USERNAME"; \
    else \
        groupadd --gid 1000 vscode; \
        useradd --uid 1000 --gid 1000 -m vscode; \
        USERNAME=vscode; \
        echo "Created new user 'vscode' with UID 1000"; \
    fi \
    && echo "$USERNAME ALL=(root) NOPASSWD:ALL" > /etc/sudoers.d/$USERNAME && \
       chmod 0440 /etc/sudoers.d/$USERNAME

# Adding python 
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    ffmpeg \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install cloudflared
RUN mkdir -p --mode=0755 /usr/share/keyrings \
    && curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null

RUN echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | tee /etc/apt/sources.list.d/cloudflared.list

RUN apt-get update && apt-get install -y cloudflared \
    && rm -rf /var/lib/apt/lists/*

USER ubuntu
 
# Adding Node.js (includes npm and npx)
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash - \
    && \. "$HOME/.nvm/nvm.sh" \
    && nvm install 24 

RUN curl -fsSL https://bun.com/install | bash - \
    && source ~/.bashrc

WORKDIR /workspace
