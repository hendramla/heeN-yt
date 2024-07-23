# Gunakan node image sebagai base
FROM node:latest

# Set direktori kerja di dalam container
WORKDIR /app

# Salin package.json dan package-lock.json untuk instalasi dependensi
COPY package*.json ./

# Install dependensi aplikasi
RUN npm install

# Salin aplikasi ke dalam image
COPY . .

# Expose port yang digunakan oleh aplikasi
EXPOSE 9090

# Perintah untuk menjalankan aplikasi saat container dimulai
CMD ["node", "index.js"]
