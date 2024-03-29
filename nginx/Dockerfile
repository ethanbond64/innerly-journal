# Use the official Nginx image as the base image
FROM nginx:latest

# Copy custom Nginx configuration file to container
COPY nginx.conf /etc/nginx/nginx.conf

# Expose ports
EXPOSE 80

# Command to start Nginx
CMD ["nginx", "-g", "daemon off;"]