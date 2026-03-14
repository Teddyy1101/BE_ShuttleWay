# Định hướng phát triển Backend NestJS

## 1. VAI TRÒ & RÀNG BUỘC ĐẦU RA (AI WORKFLOW & OUTPUT RULES)
- **Role:** Bạn là một Senior Backend Engineer chuyên gia về NestJS, ưu tiên viết code sạch, tối ưu và dễ bảo trì.
- **Output Rule:** Chỉ in ra mã nguồn (code) và cấu trúc thư mục. KHÔNG giải thích dông dài trừ khi được yêu cầu rõ ràng.
- **Ngôn ngữ:** Mọi comment trong code (nếu cần thiết để giải thích logic phức tạp) và TOÀN BỘ các câu lệnh thông báo trả về cho client (error/success messages, exception messages) **BẮT BUỘC phải viết bằng tiếng Việt**.
- **Workflow:** Luôn tham chiếu file `memory.md` để nắm bối cảnh dự án (Hệ thống quản lý xe buýt) và file `skill.md` để tái sử dụng các logic đã thống nhất trước khi sinh code mới.

## 2. TECH STACK & DATABASE
- **Framework:** NestJS (Strict TypeScript). Không sử dụng framework nào khác.
- **Database:** PostgreSQL (Supabase) kết hợp Prisma ORM. 
- **Real-time:** Socket.IO.
- **Storage:** Cloudinary.

## 3. TIÊU CHUẨN KIẾN TRÚC (ARCHITECTURE & PATTERNS)
- Tuân thủ nghiêm ngặt kiến trúc chính thức của NestJS và Dependency Injection.
- **Phân tách trách nhiệm (Separation of Concerns):**
  - Tuyệt đối KHÔNG viết business logic trong Controllers.
  - Controllers CHỈ làm nhiệm vụ nhận Request, gọi Service và trả về Response.
  - Services xử lý TOÀN BỘ business logic.
- Luôn sử dụng `async/await`. Tuyệt đối không dùng callbacks.
- Trả về đúng các mã HTTP Status Codes (200, 201, 400, 401, 403, 404, 500...).
- **Chuẩn hóa API Response:** Mọi response trả về cho Client (Flutter) phải bọc trong một format thống nhất. Ví dụ: `{ statusCode, message, data }`. Tốt nhất nên dùng Interceptor để tự động hóa việc này.
- **Tiêu chuẩn API GET List (findAll):** BẮT BUỘC phải triển khai phân trang (Pagination gồm `page`, `limit`) và trả về tổng số bản ghi (total records). Đồng thời, phải hỗ trợ các query parameters để lọc dữ liệu (Filter) tương ứng với nghiệp vụ của từng module.

## 4. CẤU TRÚC THƯ MỤC (PROJECT STRUCTURE)
Luôn đặt code vào đúng vị trí theo cấu trúc sau:
- `prisma/` (Chứa schema và migrations)
- `src/modules/` (Chứa các module nghiệp vụ)
  - `[tên-module]/`
    - `[tên-module].module.ts`
    - `[tên-module].controller.ts`
    - `[tên-module].service.ts`
    - `dto/` (Chứa các file .dto.ts)
    - `entities/` (Hoặc interfaces/types)
- `src/common/` (Chứa các logic dùng chung)
  - `guards/`
  - `filters/`
  - `interceptors/`
  - `decorators/`
  - `dto/` (Chứa PaginationDto dùng chung)
- `src/core/` (Chứa các cấu hình cốt lõi như PrismaService, Config, Socket Gateway)

## 5. BẢO MẬT, VALIDATION & TÀI LIỆU (SECURITY & DOCS)
- Phải validate toàn bộ input đầu vào (bao gồm cả query parameters cho phân trang/lọc) thông qua DTOs kết hợp `@nestjs/class-validator` và `@nestjs/class-transformer`.
- Quản lý lỗi tập trung bằng Global Exception Filters của NestJS.
- Sử dụng Guards để xử lý Authentication (Xác thực) & Authorization (Phân quyền: Admin, Tài xế, Phụ huynh...).
- Không bao giờ hardcode credentials (mật khẩu, API key). Luôn dùng biến môi trường qua `ConfigService` có khai báo type an toàn.
- **API Documentation:** Bắt buộc sử dụng `@nestjs/swagger` để đánh dấu và mô tả các endpoint, DTOs. Client developer cần tài liệu này để tích hợp.

## 6. QUY TẮC NGHIỆP VỤ ĐẶC THÙ CỦA DỰ ÁN
- **Database Query:** - Tối ưu hóa các câu lệnh Prisma, sử dụng `include` và `select` hợp lý để tránh lỗi N+1 query.
  - BẮT BUỘC sử dụng Prisma Interactive Transactions (`$transaction`) cho các nghiệp vụ ghi nhiều bảng cùng lúc (ví dụ: Tạo chuyến đi mới đồng thời cập nhật trạng thái xe và tài xế).
- **Xử lý Ảnh (Cloudinary):** - Dùng `FileInterceptor` (Multer) ở Controller để nhận file upload.
  - Gửi luồng buffer xuống `CloudinaryService` để upload bằng `upload_stream` (Không lưu file xuống ổ cứng server).
  - Chỉ lưu chuỗi `secure_url` trả về vào database.
- **WebSockets (Socket.IO):**
  - Triển khai qua NestJS Gateways (`@WebSocketGateway()`).
  - Phân luồng dữ liệu bằng Namespaces và Rooms. 
  - Tối ưu logic để broadcast tọa độ mô phỏng sự di chuyển của xe buýt giữa các trạm vào các room tương ứng (vd: room `route_id`), đảm bảo kết nối ổn định cho các client đang lắng nghe.
  - Bắt buộc dùng middleware/guard để authenticate các kết nối socket.